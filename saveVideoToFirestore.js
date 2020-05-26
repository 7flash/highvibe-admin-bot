const firebase = require('./firebase')

const database = firebase.firestore()

const saveVideoToFirestore = video => new Promise((resolve, reject) => {
    console.log({ video })
    database.collection("video").doc(video.id).set(video, { ignoreUndefinedProperties: true }).then(result => {
        console.log({ result })
        resolve(result)
    }).catch(err => {
        reject(err)
    })
})

module.exports = saveVideoToFirestore