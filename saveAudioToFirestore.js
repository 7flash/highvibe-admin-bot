const firebase = require('./firebase')

const database = firebase.firestore()

const saveAudioToFirestore = audio => new Promise((resolve, reject) => {
    console.log({ audio })
    database.collection("audio").doc(audio.id).set(audio, { ignoreUndefinedProperties: true }).then(result => {
        console.log({ result })
        resolve(result)
    }).catch(err => {
        reject(err)
    })
})

module.exports = saveAudioToFirestore