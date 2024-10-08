import OpenAI from 'openai'
import config from 'config'
import fs from 'fs'
import {dirname, resolve} from 'path'
import {fileURLToPath} from 'url'
import {createReadStream, writeFileSync} from "fs"

let globalOpenAI = null


const __dirname = dirname(fileURLToPath(import.meta.url))

const speechFile = resolve(__dirname, "../voices", `speach.mp3`)


export const createOpenAiInstance = () => {
    const openAiApiKey = config.get('openai.apiKey');
    globalOpenAI =  new OpenAI({ apiKey: openAiApiKey });
}

export const handleOpenAiRequest = async ( messages ) => {
    try {
        const response = await globalOpenAI.chat.completions.create({
            model:"gpt-4o-mini-2024-07-18",
            messages,
        })
        return response.choices[0].message.content
    } catch (e) {
        console.log("Error in GPT CHAT",e.message)
        return {content:"Ошибка открытия чата"}
    }
}


export const handleOpenAiRequestVoice = async ( messages, maleVoice = true ) => {
    try {
        const response = await globalOpenAI.chat.completions.create({
            model:"gpt-4o-mini-2024-07-18",
            messages,
        })

        console.log(response.choices[0].message)
        
        const mp3 = await globalOpenAI.audio.speech.create({
            model: "tts-1",
            voice: maleVoice ? "alloy" : 'nova',
            input: response.choices[0].message.content,
        })
        console.log(speechFile);
        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(speechFile, buffer);

        return {text: response.choices[0].message.content, buffer: buffer }
    } catch (e) {
        console.log("Error in GPT CHAT",e.message)
        return {content:"Ошибка открытия чата"}
    }
}

export const handleOpenAiVoice  = async (filepath) => {
    try {
        
        console.log("transcriptions for ",filepath)
        const response = await globalOpenAI.audio.transcriptions.create({                
            model: 'whisper-1', 
            file: createReadStream(filepath)
        })  

        return response.text
    } catch (e) {
        console.log("Error in transctription",e.message)
        return {content:"Ошибка распознавания текста"}
    }
}

export const createOpenAiImage = async ( prompt, quality=false ) => {
    try {
        console.log("Draw ",quality ? 'hd' : 'standard')
        const response = await globalOpenAI.images.generate({
            model   : "dall-e-3",
            prompt  : prompt,
            size    : "1024x1024",
            quality : quality ? 'hd' : 'standard',
            n       : 1,
        })
        return response.data[0].url
    } catch (e) {
        console.log("Error in createOpenAiImage",e.message)
        return {content:"Ошибка рисования"}
    }
}
