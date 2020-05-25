const firebase = require('./firebase.js');
const progress = require('progress-stream')

const bucket = firebase.storage().bucket()

const buildPublicUrl = fileName =>
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${(encodeURI(fileName)).replace("\/", "%2F")}?alt=media`

const uploadFileStream = ({ fileStream, filePath }) => {
    return new Promise((resolve, reject) => {
        const file = bucket.file(filePath)

        const writableStream = file.createWriteStream()

        const progressNotifier = progress({
            time: 10
        })

        progressNotifier.on('progress', (progress) => {
            console.log(Math.round(progress.percentage)+'%')
        })
        
        fileStream.pipe(progressNotifier).pipe(writableStream)

        writableStream.on('error', reject)

        writableStream.on('finish', () => {
            file.makePublic().then(() => {
                const publicUrl = buildPublicUrl(filePath)

                resolve(publicUrl)
            })
        })
    })
}

module.exports = uploadFileStream