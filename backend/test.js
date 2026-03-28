import express from 'express';
const app = express();
const server = app.listen(5001, () => console.log('Listening'));
console.log('Server is:', !!server);
