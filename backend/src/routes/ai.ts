import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

function spawnPythonPipeline(payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonBin = path.join(__dirname, '../../../ai/.venv/Scripts/python.exe');
    const cp = spawn(pythonBin, ['-m', 'ai.service'], {
      cwd: path.join(__dirname, '../../../'),
    });

    let stdout = '';
    let stderr = '';

    cp.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    cp.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    cp.on('close', (code: number) => {
      if (code === 0 || code === 1) { 
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${stdout}\nStderr: ${stderr}`));
        }
      } else {
        reject(new Error(`Python process exited with ${code}. Stderr: ${stderr}`));
      }
    });

    cp.stdin.write(JSON.stringify(payload));
    cp.stdin.end();
  });
}

export async function aiRoutes(app: FastifyInstance) {
  // Synchronous route for frontend to run real AI
  app.post('/sync-analyze', async (req, reply) => {
    const { imageBase64, citizenAnswers } = req.body as any;

    if (!imageBase64) {
      return reply.status(400).send({ error: 'imageBase64 is required' });
    }

    // Save base64 to temp file for OpenCV
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const tempPath = path.join(__dirname, `../../temp_${uuidv4()}.jpg`);
    fs.writeFileSync(tempPath, base64Data, { encoding: 'base64' });

    try {
      // Call the Python AI service
      const result = await spawnPythonPipeline({
        observation_id: 'sync-' + uuidv4(),
        image: tempPath,
        citizen_answers: citizenAnswers || {}
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ success: false, error: err.message });
    } finally {
      // Cleanup temp file
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  });
}
