import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
app.use(cors());
app.use(bodyParser.json());

import reviewRoutes from './routes/review.routes';

const port = process.env.PORT || 3004;

app.use('/api', reviewRoutes);

app.get('/', (req, res) => {
    res.send('Review pipeline service is running!');
});

app.listen(port, () => {
    console.log(`Review pipeline service listening on port ${port}`);
});
