const path = require('node:path');

module.exports = {
  entry: './public/app.js',
  output: {
    path: path.resolve(__dirname, 'public/build'),
    filename: 'app.js',
    clean: true,
  },
};
