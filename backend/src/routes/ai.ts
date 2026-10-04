import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

function getPythonExecutable(): string {
  const venvPythonWin = path.join(process.cwd(), 'ai/.venv/Scripts/python.exe');
  const venvPythonUnix = path.join(process.cwd(), 'ai/.venv/bin/python');
  const relVenvWin = path.join(__dirname, '../../../ai/.venv/Scripts/python.exe');

  if (fs.existsSync(venvPythonWin)) return venvPythonWin;
  if (fs.existsSync(relVenvWin)) return relVenvWin;
  if (fs.existsSync(venvPythonUnix)) return venvPythonUnix;
  return process.env.PYTHON_PATH || 'python';
}

function spawnPythonPipeline(payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonBin = getPythonExecutable();
    const rootDir = path.resolve(__dirname, '../../../');

    const cp = spawn(pythonBin, ['-m', 'ai.service'], {
      cwd: fs.existsSync(path.join(rootDir, 'ai')) ? rootDir : process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdout = '';
    let stderr = '';

    cp.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    cp.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    cp.on('close', (code: number) => {
      if (code === 0 || code === 1) {
        try {
          const jsonStart = stdout.indexOf('{');
          const jsonEnd = stdout.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const rawJson = stdout.substring(jsonStart, jsonEnd + 1);
            resolve(JSON.parse(rawJson));
          } else {
            resolve(JSON.parse(stdout));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${stdout}\nStderr: ${stderr}`));
        }
      } else {
        reject(new Error(`Python process exited with code ${code}. Stderr: ${stderr}`));
      }
    });

    cp.stdin.write(JSON.stringify(payload));
    cp.stdin.end();
  });
}

export async function aiRoutes(app: FastifyInstance) {
  // Synchronous route for frontend to run real multi-modal AI
  app.post('/sync-analyze', async (req, reply) => {
    const { imageBase64, citizenAnswers } = req.body as any;

    if (!imageBase64) {
      return reply.status(400).send({ error: 'imageBase64 is required' });
    }

    // Save base64 to temp file for OpenCV and vision analysis
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const tempPath = path.join(process.cwd(), `temp_${uuidv4()}.jpg`);
    fs.writeFileSync(tempPath, base64Data, { encoding: 'base64' });

    try {
      // Call the Python AI service
      const result = await spawnPythonPipeline({
        observation_id: 'sync-' + uuidv4(),
        image: tempPath,
        citizen_answers: citizenAnswers || {},
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ success: false, error: err.message });
    } finally {
      // Cleanup temp file
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
    }
  });
}
