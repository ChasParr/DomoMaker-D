let io;

const Rooms = [];
const Users = {};
const Names = {};

// game constants
const HEIGHT = 500;
// const WIDTH = 700;
const GROUND_LEVEL = 80;
const WATER_SPREAD = 85;
const WATER_OFFSET = 70;
const PLANT_PROX = 20;
const GROWTH_INTERV = 10000;
const PLANTS = {
  daisy: {
    SPRITE_ROW: 0,
    STAGES: 4,
    MAX_AGE: 100,
    AGE_INCR: 33, // = MAX_AGE / STAGES - 1
    HEIGHT: [30, 85, 170, 205],
    WIDTH: [60, 80, 80, 80],
  },
};
const STORE = {
  WATER: 200,
  DAISY: 100,
};

const randColor = () => {
  const red = Math.floor((Math.random() * 255) + 0);
  return `rgb(${red}, ${255 - red}, ${Math.floor((Math.random() * 255) + 0)})`;
};

const checkWaterColl = (x1, x2) => (x1 - x2 <= WATER_SPREAD + WATER_OFFSET &&
    x1 - x2 >= WATER_OFFSET);

// create a new room
const loadRoom = (roomData) => {
  const newRoom = {
    roomName: roomData.roomName,
    host: 0,
    Plants: roomData.plants,
    UserIds: [],
    Watering: [],
    Func: {},
  };
    /*
    // calculate time difference
    const timeDiff = new Date().getTime() - roomData.lastStored;
    for (let i = 0; i < newRoom.Plants; i++){

        if (newRoom.Plants[i].water > 0)
    }
    */

  newRoom.Func.updatePlants = function () {
    for (let i = 0; i < newRoom.Plants.length; i++) {
      const plant = newRoom.Plants[i];
      if (plant.water > 0) {
        plant.water--;
        if (plant.age < PLANTS[plant.type].MAX_AGE) {
          plant.age++;
        }
      }

      if (plant.age >= (plant.stage + 1) * PLANTS[plant.type].AGE_INCR) {
        plant.stage++;
        plant.height = PLANTS[plant.type].HEIGHT[plant.stage];
        plant.width = PLANTS[plant.type].WIDTH[plant.stage];
      }
      newRoom.Plants[i] = plant;
    }
        // io.sockets.in(newRoom.roomName).emit('updateAllPlants', newRoom.Plants);
  };

  newRoom.Func.checkWatering = function () {
    if (newRoom.Watering.length > 0) {
      for (let i = newRoom.Watering.length - 1; i >= 0; i--) {
        const user = Users[newRoom.Watering[i]];
        if (user.mode !== 'watering') {
          newRoom.Watering.splice(i, 1);
        } else {
          if (user.water <= 0) {
            user.water = 0;
            user.mode = 'water';
          } else {
            for (let j = 0; j < newRoom.Plants.length; j++) {
              if (checkWaterColl(user.x, newRoom.Plants[j].x) && newRoom.Plants[j].water < 100) {
                newRoom.Plants[j].water++;
                user.points++;
              }
            }
            user.water--;
          }
          Users[newRoom.Watering[i]] = user;
        }
      }
    }
  };

  newRoom.Func.syncClients = function () {
    io.sockets.in(newRoom.roomName).emit('syncRoom', {
      Plants: newRoom.Plants,
      Users,
      Time: new Date().getTime(),
    });
  };

  Rooms.push(newRoom);
  return (Rooms.length - 1);
};

const onJoin = (sock) => {
  const socket = sock;

  socket.on('join', () => {
    console.log('join');
    socket.uid = socket.handshake.session.account._id;
    socket.roomName = socket.handshake.session.roomData.roomName;
    socket.rNum = Rooms.findIndex((room) => room.roomName === socket.roomName);
    if (socket.rNum === -1) {
      socket.rNum = loadRoom(socket.handshake.session.roomData);
    }
    Rooms[socket.rNum].UserIds.push(socket.uid);
    if (Rooms[socket.rNum].UserIds.length === 1) {
      Rooms[socket.rNum].host = socket.uid;
    }

    socket.join(socket.roomName);

        // add user to users
    Users[socket.uid] = {
      id: socket.uid,
      color: randColor(),
      name: socket.handshake.session.account.username,
      room: socket.rNum,
      x: 0,
      y: 0,
      points: socket.handshake.session.account.points,
      water: socket.handshake.session.account.water,
      mode: 'none',
      seeds: socket.handshake.session.account.seeds,
            // lastUpdate: new Date().getTime()
    };

        // give the client the state of the server
    socket.emit('syncClient', {
      id: socket.uid,
      Plants: Rooms[socket.rNum].Plants,
      Users,
      Rooms,
      roomNum: socket.rNum,
    });

        // send new user's data to all clients
    io.sockets.in(socket.roomName).emit('updateUsers', {
      user: Users[socket.uid],
    });
    io.sockets.in(socket.roomName).emit('updateRoom', {
      room: Rooms[socket.rNum],
    });
    io.sockets.in(socket.roomName).emit('newMessage', {
      message: `${Users[socket.uid].name} joined ${socket.roomName}`,
      color: 'black',
    });
    console.log(`someone joined ${socket.roomName}`);
  });

    // remove users if they leave
  socket.on('disconnect', () => {
    socket.leave(socket.roomName);
    if (Users[socket.uid] != null) {
      delete Names[Users[socket.uid].name];
      delete Users[socket.uid];
    }
    if (Rooms[socket.rNum] != null) {
      Rooms[socket.rNum].UserIds.splice(
            Rooms[socket.rNum].UserIds.indexOf(socket.uid), 1);
      if (Rooms[socket.rNum].UserIds.length > 0) {
        if (socket.uid === Rooms[socket.rNum].host) {
          io.sockets.in(socket.roomName).emit('hostLeft');
          Rooms[socket.rNum].host = Rooms[socket.rNum].UserIds[0];
          io.sockets.in(socket.roomName).emit('newMessage', {
            message: `${Rooms[socket.rNum].host} is new host`,
            color: 'black',
          });
          console.log(`${Rooms[socket.rNum].host} is new host`);
          io.sockets.in(socket.roomName).emit('updateRoom', {
            room: Rooms[socket.rNum],
          });
        }
      } else {
        Rooms[socket.rNum].host = -1;
      }
      io.sockets.in(socket.roomName).emit('removeUser', {
        id: socket.uid,
      });
    }
    console.log('someone left');
  });

  socket.on('sendMessage', (data) => {
    const newMessage = data.message.replace(/</g, '&lt;');
    io.sockets.in(socket.roomName).emit('newMessage', {
      message: `${Users[socket.uid].name}: ${newMessage}`,
      color: Users[socket.uid].color,
    });
  });

    // get movement on the canvas
  socket.on('userMove', (data) => {
    Users[socket.uid].x = data.x;
    Users[socket.uid].y = data.y;
  });

  socket.on('newPlant', (data) => {
    console.log(data);
        // check for proximity to other plants
    if (Users[socket.uid].seeds <= 0) {
      socket.emit('denied', {
        message: 'server: no seeds',
        code: 'plant',
      });
      return;
    }
    for (let i = 0; i < Rooms[socket.rNum].Plants.length; i++) {
      if (Math.abs(data.x - Rooms[socket.rNum].Plants[i].x) < PLANT_PROX) {
        socket.emit('denied', {
          message: 'server: too close to another plant',
          code: 'plant',
        });
        return;
      }
    }
    const newPlant = {
      x: data.x,
      y: HEIGHT - GROUND_LEVEL,
      age: 0,
      stage: 0,
      water: 0,
      owner: socket.uid,
      ownerName: Users[socket.uid].name,
      type: data.type,
      maxAge: PLANTS[data.type].MAX_AGE,
      ageIncr: PLANTS[data.type].AGE_INCR,
      stages: PLANTS[data.type].STAGES,
      height: PLANTS[data.type].HEIGHT[0],
      width: PLANTS[data.type].WIDTH[0],
      spriteRow: PLANTS[data.type].SPRITE_ROW,
            //lastUpdate: new Date.getTime()
    };

    Rooms[socket.rNum].Plants.push(newPlant);
    Users[socket.uid].seeds--;
  });

  socket.on('updateUser', (data) => {
    Users[data.id] = data;
  });

    // change mode on button press
  socket.on('changeMode', (data) => {
    Users[socket.uid].mode = data;
    if (data === 'watering') {
      Rooms[socket.rNum].Watering.push(socket.uid);
    }
  });

  socket.on('buyItem', (data) => {
    if (Users[socket.uid].points < STORE[data]) {
      socket.emit('denied', {
        message: 'server: not enough karma',
        code: 'store',
      });
      return;
    }
    switch (data) {
      case 'WATER':
        if (Users[socket.uid].water >= 100) {
          socket.emit('denied', {
            message: 'server: water already full',
            code: 'store',
          });
          return;
        }
        Users[socket.uid].water = 100;
        Users[socket.uid].points -= STORE[data];
        break;
      case 'DAISY':
        Users[socket.uid].seeds++;
        Users[socket.uid].points -= STORE[data];
        break;
      default:
        socket.emit('denied', {
          message: 'server: not an item',
          code: 'store',
        });
        break;
    }
  });

  socket.on('buyKarma', (data) => {
    Users[socket.uid].points += data;
  });
};

const updatePlantGrowth = () => {
  const userKeys = Object.keys(Users);

  for (let i = 0; i < userKeys.length; i++) {
    if (Users[userKeys[i]].water < 100) {
      Users[userKeys[i]].water++;
    }
  }
  for (let i = 0; i < Rooms.length; i++) {
    Rooms[i].Func.updatePlants();
  }
    // console.log('plants updated');
};

const updateWater = () => {
  for (let i = 0; i < Rooms.length; i++) {
    Rooms[i].Func.checkWatering();
  }
};

const updateTick = () => {
  for (let i = 0; i < Rooms.length; i++) {
    Rooms[i].Func.syncClients();
  }
};


const setupSockets = (ioServer) => {
  io = ioServer;
  console.log(io);
  io.on('connection', (socket) => {
    onJoin(socket);
    console.log('connection');
  });
  setInterval(() => {
    updatePlantGrowth();
  }, GROWTH_INTERV);

  setInterval(() => {
    updateWater();
  }, 200);

  setInterval(() => {
    updateTick();
  }, 16);
};

module.exports.setupSockets = setupSockets;
