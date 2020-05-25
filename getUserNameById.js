const firebase = require('./firebase')

const database = firebase.firestore()

const getUserNameById = userId => {
    return new Promise((resolve, reject) => {
        database.doc(`users/${userId}`).get().then(snapshot => {
            if (snapshot.exists) {
                const userName = snapshot.data().name.toString()

                resolve(userName)
            } else {
                reject("user not found")
            }
        })
    })
}

module.exports = getUserNameById