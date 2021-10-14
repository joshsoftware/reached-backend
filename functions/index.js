
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { user } = require("firebase-functions/lib/providers/auth");

const stage = admin.initializeApp(
  {
  databaseURL: "https://reached.firebaseio.com",
  }
);


exports.onGroupLeaveRequest = functions.database
      .ref("/requests/{memberId}/{requestId}/")
      .onCreate(async(snapshot, context) => {
          const request = snapshot.val()
          console.log(Object.keys(request))
          const jsonPayload = { 
            requestId: context.params.requestId,
            groupId: request.data.group.id,
            memberId: context.params.memberId
          }
         const payload = {
           data: { payload: JSON.stringify(jsonPayload), type: "leave_group" },
           notification: {
             title: request.data.group.name,
             body: request.data.from + " has sent a request to exit the group"
           }
         };

         admin.database()
         .ref("/users/").child(request.data.to)
         .once("value")
         .then((userSnap) => {
            const fcmTokens = []
            const watchToken = userSnap.val().token.watch
            const phoneToken = userSnap.val().token.phone
            if(watchToken != undefined) {
              fcmTokens.push(watchToken);
            }
            fcmTokens.push(phoneToken);
            admin.messaging().sendToDevice(fcmTokens, payload);
         })
      });


exports.onGeofenceTransition = functions.database
      .instance("reached-stage")
      .ref("/groups/{groupId}/members/{memberId}/address/{addressId}/transition")
      .onUpdate(async(change, context) => {

    let db = admin.database()
    const groupId = context.params.groupId
    const memberId = context.params.memberId
    const addressId = context.params.addressId

    const newValue = change.after.val()
    const oldValue = change.before.val()
    let memberName = ""
    let address = ""
    let tokens = [];
    const promises = [];
    if(newValue != oldValue) {
      if(newValue) {

        const memberSnap = await db.ref("/groups/").child(groupId).child("/members/").child(memberId).once("value")
        
          
        memberName = memberSnap.val().name
        address = memberSnap.val().address[addressId]
        promises.push(new Promise((resolve, reject) => {
          db.ref("/groups/").child(groupId)
          .once("value")
          .then((group) => {
            if(memberId != group.val().created_by) {
              db.ref("/users/").child(group.val().created_by)
              .once("value")
              .then((userSnap) => {
                const fcmTokens = []
                const watchToken = userSnap.val().token.watch
                const phoneToken = userSnap.val().token.phone
                if(watchToken != undefined) {
                  fcmTokens.push(watchToken);
                }
                console.log(watchToken)
                console.log(phoneToken)
                fcmTokens.push(phoneToken);
                resolve(fcmTokens)
              }).catch((e) => reject(e))
            }
          }).catch((e) => reject(e))

          
        }))
        const jsonPayload = { 
          groupId: groupId,
          memberId: memberId
       }
       const payload = {
         data: { payload: JSON.stringify(jsonPayload), type: "geofence" },
         notification: {
           title: "Location alert",
           body: memberName + (newValue == "enter" ? "reached " + address.name : "left " + address.name)
         }
       };
       
       Promise.all(promises)
       .then((results) => {
         console.log(results.length)
         results.forEach((result) => {
           Array.prototype.push.apply(tokens, result);
         })
         console.log("tokens: " + tokens.length)
         admin.messaging().sendToDevice(tokens, payload);
       }).catch((e) => console.log(console.error()))
      }
    }

})

exports.onSosStatusChange = functions.database
    .instance("reached-stage")
    .ref("/users/{userId}/sosState")
    .onUpdate(async(change, context) => {
      const userId = context.params.userId
      const newValue = change.after.val();
      const previousValue = change.before.val();
      const promises = []
      let memberName = ""
      let groupId = ""
      let tokens = [];
      if(newValue != previousValue) {
        if(newValue) {
          
                
          const snap = await admin.database()
          .ref("/users/").child(userId)
          .once("value")

          memberName = snap.val().name
          promises.push(new Promise((resolve, reject) => {
            Object.keys(snap.val().groups).forEach((gId) => {
                 admin.database()
                 .ref("/groups/")
                 .child(gId)
                 .once("value")
                  .then((groupSnap) => {
                    groupId = gId
                    Object.keys(groupSnap.val().members).forEach((mId) => {
                      admin.database()
                     .ref("/users/").child(mId)
                     .once("value")
                      .then((userSnap) => {
                       const fcmTokens = []
                       const watchToken = userSnap.val().token.watch
                       const phoneToken = userSnap.val().token.phone
                       if(watchToken != undefined) {
                          fcmTokens.push(watchToken);
                        }
                       fcmTokens.push(phoneToken);
                        resolve(fcmTokens)
                      })
                    })
                      
                  })
                })

        }))
          
          const jsonPayload = { 
             memberId: userId,
             groupId: groupId
          }
          const payload = {
            data: { payload: JSON.stringify(jsonPayload), type: "sos" },
            notification: {
              title: 'SOS alert!',
              body: "This is an SOS from " + memberName
            }
          };
          
          Promise.all(promises)
          .then((results) => {
            results.forEach((result) => {
              Array.prototype.push.apply(tokens, result);
            })
            console.log(tokens)
            admin.messaging().sendToDevice(tokens, payload);
          }).catch((e) => console.log(console.error()))
        }
      }
      
})

exports.onGroupJoin = functions.database
    .instance("reached-stage")
    .ref("/groups/{groupId}/members/{memberId}")
    .onCreate(async(snapshot, context) => {
      const groupId = context.params.groupId
      const memberId = context.params.memberId
      
      const jsonPayload = {
        groupId: groupId
      }

      const payload = {
        data: { payload: JSON.stringify(jsonPayload), 
          type: "join_group" },
        notification: {
          title: 'New member joined',
          body: snapshot.val().name + " joined the group"
        }
      };
      const memberSnapShot = await snapshot.ref.parent.once("value")
          
      let tokens = [];
      const promises = [];
      memberSnapShot.forEach((child)=> {
          if(child.key != memberId) {
            promises.push(new Promise((resolve, reject) => {
              admin.database()
              .ref("/users/").child(child.key)
              .once("value")
              .then((userSnap) => {
                const fcmTokens = []
                const watchToken = userSnap.val().token.watch
                const phoneToken = userSnap.val().token.phone
                if(watchToken != undefined) {
                  fcmTokens.push(watchToken);
                }
                console.log(watchToken)
                console.log(phoneToken)
                fcmTokens.push(phoneToken);
                resolve(fcmTokens)
              }).catch((e) => reject(e))
            }))
          }
      });

      Promise.all(promises)
      .then((results) => {
        console.log(results.length)
        results.forEach((result) => {
          Array.prototype.push.apply(tokens, result);
        })
        console.log("tokens: " + tokens.length)
        admin.messaging().sendToDevice(tokens, payload);
      }).catch((e) => console.log(console.error()))
        
    
    });



exports.onMemberDelete = functions.database
    .instance("reached-stage")
    .ref("/groups/{groupId}/members/{memberId}")
    .onDelete(async(snapshot, context) => {
      const groupId = context.params.groupId
      const memberId = context.params.memberId
      const tokens = [];
      const promises = [];
      const groupSnap = await admin.database()
      .ref("/groups/")
      .child(groupId)
      .once("value")

      const group = groupSnap.val()
      const createdBySnap = await admin.database()
      .ref("/users/")
      .child(group.created_by)
      .once("value")

      const adminName =  createdBySnap.val().name
      const groupName = group.name
      
      promises.push(new Promise((resolve, reject) => {
        admin.database()
        .ref("/users/")
        .child(memberId)
        .once("value")
        .then((userSnap) => {
          const fcmTokens = []
          const watchToken = userSnap.val().token.watch
          const phoneToken = userSnap.val().token.phone
          if(watchToken != undefined) {
            fcmTokens.push(watchToken);
          }
          console.log(watchToken)
          console.log(phoneToken)
          fcmTokens.push(phoneToken);
          resolve(fcmTokens)
        }).catch((e) => reject(e))
      }))

     const jsonPayload = {
        groupId: groupId
        }
     const payload = {
        data: { 
          payload: JSON.stringify(jsonPayload), 
          type: "removed_member" },
        notification: {
           title: groupName,
           body: adminName + " removed you from the group"
        }
      };
      Promise.all(promises)
      .then((results) => {
        results.forEach((result) => {
          Array.prototype.push.apply(tokens, result);
        })
        admin.messaging().sendToDevice(tokens, payload);
      }).catch((e) => console.log(console.error()))
    });



exports.onGroupDelete = functions.database
    .instance("reached-stage")
    .ref("/groups/{groupId}")
    .onDelete(async(snapshot, context) => {
      const groupId = context.params.groupId
      const tokens = [];
      const promises = [];
      const groupSnap = await admin.database()
      .ref("/groups/")
      .child(groupId)
      .once("value")

      const group = groupSnap.val()
      const createdBySnap = await admin.database()
      .ref("/users/")
      .child(group.created_by)
      .once("value")

      const adminName =  createdBySnap.val().name
      const groupName = group.name
      
      promises.push(new Promise((resolve, reject) => {
        admin.database()
        .ref("/users/")
        .child(memberId)
        .once("value")
        .then((userSnap) => {
          const fcmTokens = []
          const watchToken = userSnap.val().token.watch
          const phoneToken = userSnap.val().token.phone
          if(watchToken != undefined) {
            fcmTokens.push(watchToken);
          }
          console.log(watchToken)
          console.log(phoneToken)
          fcmTokens.push(phoneToken);
          resolve(fcmTokens)
        }).catch((e) => reject(e))
      }))

     const jsonPayload = {
        groupId: groupId
        }
     const payload = {
        data: { 
          payload: JSON.stringify(jsonPayload), 
          type: "removed_member" },
        notification: {
           title: groupName,
           body: adminName + " removed you from the group"
        }
      };
      Promise.all(promises)
      .then((results) => {
        results.forEach((result) => {
          Array.prototype.push.apply(tokens, result);
        })
        admin.messaging().sendToDevice(tokens, payload);
      }).catch((e) => console.log(console.error()))
    });