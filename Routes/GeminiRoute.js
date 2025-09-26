import express from 'express';
import { GenerateJson, Rewrite, Deluge, CreateActions, GenerateApp, upload } from '../Controllers/GeminiController.js';

const router = express.Router();

router.post('/generate/json', GenerateJson);
router.post('/rewrite', Rewrite);
router.post('/deluge', Deluge);
router.post('/create/actions', CreateActions);
router.post('/generate/app', upload.single('file'), GenerateApp);

export default router;