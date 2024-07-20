const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 100 * 1024 * 1024 } // 100 MB
});

app.use(bodyParser.json());
app.use(express.static('public'));

// Route for handling local file uploads
app.post('/upload', upload.single('file'), (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).send('No file uploaded.');
    }

    const videoPath = path.join(__dirname, file.path);
    const outputDir = 'outputs';
    const srtOutput = path.join(__dirname, outputDir, `${file.filename}.srt`);
    const assOutput = path.join(__dirname, outputDir, `${file.filename}.ass`);

    fs.mkdirSync(outputDir, { recursive: true });

    const extractSubtitles = (input, output, format, callback) => {
        exec(`ffmpeg -i ${input} -map 0:s:0 ${output}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error extracting ${format}:`, error);
                console.error(`FFmpeg stderr:`, stderr);
                return callback(error);
            }
            callback(null, output);
        });
    };

    extractSubtitles(videoPath, srtOutput, 'srt', (srtError, srtPath) => {
        if (srtError) return res.status(500).send('Error extracting SRT subtitles.');

        extractSubtitles(videoPath, assOutput, 'ass', (assError, assPath) => {
            if (assError) return res.status(500).send('Error extracting ASS subtitles.');

            res.json({
                srt: `/download?file=${path.relative(__dirname, srtPath)}`,
                ass: `/download?file=${path.relative(__dirname, assPath)}`
            });
        });
    });
});

// Route for handling remote file uploads
app.post('/remote-upload', async (req, res) => {
    const { url } = req.body;
    const fileName = path.basename(url);
    const uploadsDir = 'uploads';
    const videoPath = path.join(__dirname, uploadsDir, fileName);
    const outputDir = 'outputs';
    const srtOutput = path.join(__dirname, outputDir, `${fileName}.srt`);
    const assOutput = path.join(__dirname, outputDir, `${fileName}.ass`);

    fs.mkdirSync(outputDir, { recursive: true });

    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        response.data.pipe(fs.createWriteStream(videoPath))
            .on('finish', () => {
                const extractSubtitles = (input, output, format, callback) => {
                    exec(`ffmpeg -i ${input} -map 0:s:0 ${output}`, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`Error extracting ${format}:`, error);
                            console.error(`FFmpeg stderr:`, stderr);
                            return callback(error);
                        }
                        callback(null, output);
                    });
                };

                extractSubtitles(videoPath, srtOutput, 'srt', (srtError, srtPath) => {
                    if (srtError) return res.status(500).send('Error extracting SRT subtitles.');

                    extractSubtitles(videoPath, assOutput, 'ass', (assError, assPath) => {
                        if (assError) return res.status(500).send('Error extracting ASS subtitles.');

                        res.json({
                            srt: `/download?file=${path.relative(__dirname, srtPath)}`,
                            ass: `/download?file=${path.relative(__dirname, assPath)}`
                        });
                    });
                });
            })
            .on('error', (error) => {
                console.error('Error downloading video:', error);
                res.status(500).send('Error downloading video');
            });
    } catch (error) {
        console.error('Error fetching video URL:', error);
        res.status(500).send('Error fetching video URL');
    }
});

// Route for downloading extracted subtitles
app.get('/download', (req, res) => {
    const file = req.query.file;
    const filePath = path.join(__dirname, file);
    res.download(filePath);
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});
