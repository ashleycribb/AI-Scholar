import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const port = process.env.PORT || 3003;

import { startFineTuningJob } from './fineTuning';

app.post('/fine-tune', async (req, res) => {
    const { datasetId, modelId } = req.body;
    try {
        const response = await startFineTuningJob(datasetId, modelId);
        res.json({ message: 'Fine-tuning job started', response });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error starting fine-tuning job' });
    }
});

app.listen(port, () => {
    console.log(`Fine-tuning service listening on port ${port}`);
});
