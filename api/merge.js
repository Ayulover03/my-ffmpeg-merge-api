// api/merge.js
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// 强制 fluent-ffmpeg 使用 ffmpeg-static 提供的二进制
ffmpeg.setFfmpegPath(ffmpegStatic);

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
    await downloadFile(video_url, videoPath);
    await downloadFile(audio_url, audioPath);

    ffmpeg(videoPath)
      .input(audioPath)
      .output(outputPath)
      .videoCodec('copy')
      .audioCodec('aac')
      .format('mp4')
      .on('end', () => {
        res.status(200).json({
          message: "合并成功",
          url: `/tmp/output/final_${Date.now()}.mp4`,
          warning: "此文件仅在函数运行期间存在"
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Processing failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Download or processing failed', details: error.message });
  }
}
