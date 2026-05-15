import express from 'express';
import cors from 'cors';
import uploadRouter from './routes/upload';
import generateRouter from './routes/generate';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/upload', uploadRouter);
app.use('/api/generate', generateRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n🚀 PDF Grouper backend running on http://localhost:${PORT}\n`);
});
