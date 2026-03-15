const serve = require('serve');
const server = serve('dist', {
  port: 3000,
  ignore: ['node_modules']
});
