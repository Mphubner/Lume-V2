import express from 'express';
const app = express();
const server = app.listen(5001, () => {
  console.log('Listening on 5001');
  console.log('Active handles:', process._getActiveHandles().map(h => h.constructor.name));
});
