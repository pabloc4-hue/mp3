/*
 * Connect all of your endpoints together here.
 */
const usersRoutes = require("./users");
const tasksRoutes = require("./tasks");
const homeRoutes = require("./home");

module.exports = function (app, router) {
  app.use('/api', router);

  // subroutes
  router.use('/users', require('./users'));
  router.use('/tasks', require('./tasks'));

  // health check route
  router.get('/', (req, res) => {
    res.json({ message: 'OK', data: { service: 'MP3 API running' } });
  });
};
