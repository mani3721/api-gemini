import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import geminiRoutes from './Routes/GeminiRoute.js';

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', geminiRoutes);


// Start server
app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});