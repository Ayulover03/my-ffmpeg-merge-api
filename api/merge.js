// api/merge.js
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const __dirname = new URL(import.meta.url).pathname.replace(/\/[^/]+$/, '');

const TMP_DIR = path.join(__dirname, '../tmp');
const INPUT_DIR = path.join(TMP_DIR, 'input');
const OUTPUT_DIR = path.join(TMP_DIR, 'output');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

ensureDir(TMP_DIR);
ensureDir(INPUT_DIR);
ensureDir(OUTPUT_DIR);

const downloadFile = async (url, filepath) => {
  const res = await fetch(url);
  const fileStream = fs.createWriteStream(filepath);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { video_url, audio_url } = req.body;

  if (!video_url || !audio_url) {
    return res.status(400).json({ error: 'Missing video_url or audio_url' });
  }

  const ffmpeg = createFFmpeg({
    log: true,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.6/dist/ffmpeg-core.js'
  });

  try {
    const videoPath = 'input.mp4';
    const audioPath = 'input.mp3';
    const outputPath = 'output.mp4';

    // 下载文件到内存
    await downloadFile(video_url, path.join(INPUT_DIR, videoPath));
    await downloadFile(audio_url, path.join(INPUT_DIR, audioPath));

    // 加载 FFmpeg
    await ffmpeg.load();

    // 写入文件到 FFmpeg 虚拟文件系统
    ffmpeg.FS('writeFile', videoPath, await fetchFile(path.join(INPUT_DIR, videoPath)));
    ffmpeg.FS('writeFile', audioPath, await fetchFile(path.join(INPUT_DIR, audioPath)));

    // 执行合并命令
    await ffmpeg.run('-i', videoPath, '-i', audioPath, '-c:v', 'copy', '-c:a', 'aac', '-shortest', outputPath);

    // 读取输出文件
    const data = ffmpeg.FS('readFile', outputPath);

    // 返回 base64 或上传到 Blob（推荐）
    res.status(200).json({
      message: "合并成功",
      url: `data:video/mp4;base64,${data.buffer.toString('base64')}`,
      size: data.length
    });

  } catch (error) {
    console.error('FFmpeg error:', error);
    res.status(500).json({ error: 'Processing failed', details: error.message });
  } finally {
    ffmpeg.exit();
  }
}
