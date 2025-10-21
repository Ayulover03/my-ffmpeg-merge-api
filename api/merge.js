// api/merge.js
import ffmpeg from 'ffmpeg.wasm';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const __filename = import.meta.url;
const __dirname = path.dirname(__filename);

const TMP_DIR = path.join(__dirname, '../tmp');
const INPUT_DIR = path.join(TMP_DIR, 'input');
const OUTPUT_DIR = path.join(TMP_DIR, 'output');

// 确保目录存在
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

ensureDir(TMP_DIR);
ensureDir(INPUT_DIR);
ensureDir(OUTPUT_DIR);

// 下载文件
const downloadFile = async (url, filepath) => {
  const res = await fetch(url);
  const fileStream = fs.createWriteStream(filepath);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
};

// 清理临时文件
const cleanup = (files) => {
  files.forEach((file) => {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (e) {}
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

  const videoPath = path.join(INPUT_DIR, 'input.mp4');
  const audioPath = path.join(INPUT_DIR, 'input.mp3');
  const outputPath = path.join(OUTPUT_DIR, `final_${Date.now()}.mp4`);

  try {
    // 1. 下载视频和音频
    await downloadFile(video_url, videoPath);
    await downloadFile(audio_url, audioPath);

    // 2. 初始化 FFmpeg
    const ffmpegInstance = await ffmpeg();
    ffmpegInstance.FS('writeFile', 'video.mp4', fs.readFileSync(videoPath));
    ffmpegInstance.FS('writeFile', 'audio.mp3', fs.readFileSync(audioPath));

    // 3. 合并音视频
    await ffmpegInstance.run(
      '-i', 'video.mp4',
      '-i', 'audio.mp3',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      '-y',
      'output.mp4'
    );

    // 4. 读取输出文件
    const outputData = ffmpegInstance.FS('readFile', 'output.mp4');
    fs.writeFileSync(outputPath, Buffer.from(outputData));

    // 5. 返回结果
    res.status(200).json({
      message: "合并成功",
      url: outputPath,
      warning: "此文件仅在函数运行期间存在，建议改用 Vercel Blob 存储"
    });

  } catch (error) {
    console.error('FFmpeg error:', error);
    res.status(500).json({ error: 'Processing failed', details: error.message });
  } finally {
    cleanup([videoPath, audioPath, outputPath]);
  }
}
