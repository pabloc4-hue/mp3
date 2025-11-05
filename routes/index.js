/*
 * Connect all of your endpoints together here.
 */
const usersRoutes = require("./users");
const tasksRoutes = require("./tasks");
const homeRoutes = require("./home");

module.exports = function (app, router) {
  // Grupo principal de la API
  app.use('/api', router);

  // Subrutas
  router.use('/users', require('./users'));
  router.use('/tasks', require('./tasks'));

  // Ruta de salud principal
  router.get('/', (req, res) => {
    res.json({ message: 'OK', data: { service: 'MP3 API running' } });
  });
};
