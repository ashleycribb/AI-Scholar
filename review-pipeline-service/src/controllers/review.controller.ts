import { Request, Response } from 'express';
import axios from 'axios';
import config from '../config';

export const createReview = async (req: Request, res: Response) => {
    try {
        const response = await axios.post(config.agentBackendUrl, {
            intent: 'screen_papers',
            payload: {
                criteria: req.body.criteria,
                papers: req.body.papers,
            },
        });
        res.json({ message: 'Review created and screening started', data: response.data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating review' });
    }
};
