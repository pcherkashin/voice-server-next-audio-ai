// server.js
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
require('dotenv').config()
const path = require('path')
const fs = require('fs')
const OpenAI = require('openai')
const multer = require('multer')

const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(bodyParser.json())

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + '-' + Date.now() + path.extname(file.originalname)
    )
  },
})

const upload = multer({ storage: storage })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Endpoint for transcribing audio
app.post('/api/transcribe', upload.single('audioData'), async (req, res) => {
  const audioData = req.file // multer adds the file to req.file
  const filePath = audioData.path

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
    })

    res.json({ text: transcription.text })
  } catch (error) {
    console.error('Error in transcription:', error)
    res.status(500).json({ error: 'Error in transcription' })
  }
})

// Endpoint for synthesizing speech from text
app.post('/api/tts', async (req, res) => {
  const { text } = req.body
  if (!text) {
    return res.status(400).json({ message: 'No text provided' })
  }

  try {
    const speechResponse = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'onyx',
      input: text,
    })

    const buffer = Buffer.from(await speechResponse.arrayBuffer())
    const filePath = path.resolve('./', 'tempSpeech.mp3')
    await fs.promises.writeFile(filePath, buffer)

    res.sendFile(
      filePath,
      {
        headers: {
          'Content-Type': 'audio/mpeg',
        },
      },
      (err) => {
        if (err) {
          console.error('Failed to send the speech file:', err)
          res.status(500).send()
        }
        fs.unlink(filePath, () => {}) // Optionally delete file after sending
      }
    )
  } catch (error) {
    console.error('Failed to generate speech:', error)
    res.status(500).json({ message: 'Failed to generate speech' })
  }
  console.log('Text-to-speech endpoint called successfully.') // Add console.log statement to verify endpoint
})

//generate answer with OpernAI API
app.post('/api/answer', async (req, res) => {
  try {
    const prompt = req.body.prompt
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'I want you to act as an Audio AI assistant tailored for children aged 7 to 12. Use a friendly, engaging, and supportive tone, coupled with simple vocabulary suitable for kids. Your role is to assist in learning and creative tasks, providing clear, easy-to-understand tips and answers. Include motivational phrases like "Well done!", "Fantastic job!", or "You are doing great!" to encourage and celebrate the childrens efforts and achievements. The aim is to make the learning experience fun, rewarding, and accessible, helping boost the kids confidence and excitement about learning.Please ensure the answers are in JSON format with the following structure: {"response": "<answer>"}',
        },
        {
          role: 'user',
          content:
            prompt +
            ' Please ensure the answers are in JSON format with the following structure: {"response": "<answer>"}',
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 1,
    })
    console.log(JSON.stringify(completion))
    if (
      completion.choices &&
      completion.choices.length > 0 &&
      completion.choices[0].message
    ) {
      const answerDetails = completion.choices[0].message.content
      console.log(answerDetails)
      res.json(answerDetails) // Directly sending the parsed JSON
    } else {
      throw new Error('No valid response or empty choices array.')
    }
  } catch (error) {
    console.error('Failed to generate answer:', error)
    res
      .status(500)
      .json({ message: 'Failed to generate answer', error: error.message })
  }
})

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
