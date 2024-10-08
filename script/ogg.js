import axios from "axios"
import {createWriteStream} from 'fs'
import {dirname, resolve} from 'path'
import {fileURLToPath} from 'url'
import ffmpeg from 'fluent-ffmpeg'
import installer from '@ffmpeg-installer/ffmpeg'
import { unlink} from "fs/promises" 

export async function removeFile(path) {
    try {
        await unlink(path)
    } catch (e) {
        console.log("Error while removing", e.message)
    }
}

const __dirname = dirname(fileURLToPath(import.meta.url))

class OggConverter {

    constructor() {
        ffmpeg.setFfmpegPath(installer.path)
    }

    toMP3(input, output) {
        try {
            const outputPath = resolve(dirname(input), `${output}.mp3`)

            return new Promise ((resolve, reject) =>{
                ffmpeg(input)
                    .inputOption('-t 30')
                    .output(outputPath)
                    .on('end', () => {
                        removeFile(input)
                        resolve(outputPath)
                    }) 
                    .on('error', (err) =>reject(err.message))
                    .run()
            })
        } catch (e) {
            console.log("Error in convert to mp3", e.message)
        }
    }

    toOGG(input) {
        try {
            const outputPath = 'voices/tmpOggFile.ogg'           
            return new Promise ((resolve, reject) =>{
                ffmpeg(input)
                    .audioCodec('libvorbis')
                    .outputOptions('-vn')
                    .output(outputPath)
                    .on('end', () => {
                        resolve(outputPath)
                    }) 
                    .on('error', (err) =>reject(err.message))
                    .run()
            })
        } catch (e) {
            console.log("Error in convert to ogg", e.message)
        }
    }

    async create(url, filename, ext='ogg') {
        try {
            const oggPath = resolve(__dirname, "../voices", `${filename}.ogg`)
            const response = await axios({
                method:'get',
                url,
                responseType:"stream"
            })

            return new Promise((resolve)=>{
                const stream = createWriteStream(oggPath)
                response.data.pipe(stream)
                stream.on('finish', ()=>resolve(oggPath))
            })
           

        } catch (e) {
            console.log( "Error in create file", e.message)
        }
        
    }
}

export const ogg = new OggConverter()