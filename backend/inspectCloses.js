import express from 'express';
const app = express();
const server = app.listen(5001, () => {
  console.log('Listening on 5001');
});
server.on('close', () => console.log('Server closed naturally!'));
server.on('error', (e) => console.log('Server error!', e));
