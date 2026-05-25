const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// 3. HLS IMPLEMENTATION (PREVENT DOWNLOADING)
// To prevent users from downloading a single .mkv file, you must convert it to HLS (.m3u8 + .ts segments).
// Since you cannot dynamically do this on-the-fly without massive CPU usage, you must pre-process it.
// 
// Prerequisite: You MUST have FFmpeg installed on your computer.
// Download your Dropbox video locally as 'input.mkv' before running this.

const inputFile = 'input.mkv'; 
const outputDir = path.join(__dirname, 'public', 'hls');
const outputFile = path.join(outputDir, 'playlist.m3u8');

if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('Starting HLS conversion... This may take a while depending on video length.');

// FFmpeg command to segment video into 10-second .ts chunks
const cmd = `ffmpeg -i ${inputFile} -profile:v baseline -level 3.0 -s 1920x1080 -start_number 0 -hls_time 10 -hls_list_size 0 -f hls ${outputFile}`;

exec(cmd, (error, stdout, stderr) => {
    if (error) {
        console.error(`FFmpeg Error: ${error.message}`);
        console.log('\nMake sure you have FFmpeg installed and added to your PATH.');
        return;
    }
    console.log('HLS Conversion Complete!');
    console.log('You can now upload the "public/hls" folder to an S3 Bucket and serve the playlist.m3u8 to prevent easy downloading.');
});
