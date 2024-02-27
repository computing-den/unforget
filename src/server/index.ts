import express from 'express';
import path from 'path';
import { adder } from '../common/adder.js';

const PUBLIC = path.join(process.cwd(), 'public');
const DIST_PUBLIC = path.join(process.cwd(), 'dist/public');

const app = express();
app.use(express.json());

app.use('/', express.static(PUBLIC));
app.use('/', express.static(DIST_PUBLIC));

app.get('/adder', (req, res) => {
  res.send(`2 + 2 = ${adder(2, 2)}`);
});

let notes = [{ id: '1', text: 'init' }];
app.get('/api/notes', (req, res) => {
  console.log('GET /api/notes');
  res.set('Cache-Control', 'no-cache').send(notes);
});

app.post('/api/notes', (req, res) => {
  console.log('POST /api/notes', req.body);
  notes.push(...req.body);
  res.send({ ok: true });
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>unforget</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="manifest" href="/manifest.json" />
	  <script src="/index.js"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`);
});

app.listen(3000, () => {
  console.log(`Listening on port 3000`);
});
