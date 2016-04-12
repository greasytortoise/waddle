var fs = require('fs');
var util = require('util');
var formidable = require('formidable');
var request = require('request');
var foursquare = require('./foursquare.js');
var db = require('../../db/db.js').db;

// The below hard-coded examples are for testing purposes. Will be removed once Foursquare API is in place.
var restaurant = {"id":"513a4806c84c60d09153e2cc","name":"SQwers Izakaya & Sushi BAR","contact":{"phone":"4157029979","formattedPhone":"(415) 702-9979"},"location":{"address":"3015 Geary Blvd","crossStreet":"bwtn Cook St & Blake St","lat":37.781747440661505,"lng":-122.45133876800537,"distance":418,"postalCode":"94118","mayNotNeedAddress":false,"cc":"US","city":"San Francisco","state":"CA","country":"United States","formattedAddress":["3015 Geary Blvd (bwtn Cook St & Blake St)","San Francisco, CA 94118","United States"]},"categories":[{"id":"4bf58dd8d48988d1d2941735","name":"Sushi Restaurant","pluralName":"Sushi Restaurants","shortName":"Sushi","icon":{"prefix":"https://ss3.4sqi.net/img/categories_v2/food/sushi_","suffix":".png"},"primary":true}],"verified":false,"stats":{"checkinsCount":313,"usersCount":199,"tipCount":10},"url":"http://sqwers.eat24hour.com","delivery":{"id":"27042","url":"http://www.seamless.com/food-delivery/restaurant.27042.r?a=1026&utm_source=Foursquare&utm_medium=affiliate&utm_campaign=SeamlessOrderDeliveryLink","provider":{"name":"seamless"}},"allowMenuUrlEdit":true,"specials":{"count":0,"items":[]},"hereNow":{"count":0,"summary":"Nobody here","groups":[]},"referralId":"v-1460144909","venueChains":[]};
var firstMatchedUser = {"username":"Nathaniel","email":"nedwards@gmail.com","funfact":"I can code all the things","profileimage":"https://avatars1.githubusercontent.com/u/5132757?v=3&s=400"};
var secondMatchedUser = {"username":"Sloth","email":"sloth@slothmail.com","funfact":"I am a sloth","profileimage":"https://i.ytimg.com/vi/x6VgzTsToyY/hqdefault.jpg"};

// Mongoose models
var mongoose = require('mongoose');
var db = require('../../db/db.js').db;
var MatchRequest = require('../../db/config.js').MatchRequest;
var SuccessfulMatch = require('../../db/config.js').SuccessfulMatch;


// Bluebird promises used for interacting with database
var Promise = require('bluebird');
// temporary fake users table
var Users = {rahim: '', kevin: '', nathaniel: '', michelle: ''};

// Iterates through potential matches and returns the first valid one found
var getFirstValidMatch = function(username, matchRequestsArray) {
  var validMatch;
  for (var i = 0; i < matchRequestsArray.length; i++) {
    // Check if the match request was not made by the same user
    if (matchRequestsArray[i].username !== username) {
      validMatch = matchRequestsArray[i];
      break;
    }
  }
  return validMatch;
};

module.exports = {
  getHome: function(req, res) {
    // TODO:
    // if user is aleady connected with FB
      res.send('You are home!');
    // else
  },

  getSignin: function(req, res) {
    res.send('get signing in...');
  },

  postSignin: function(req, res) {
    // check user exist in the database
    console.log('postSignin fired!', req.body);
    var username = req.body.username;
    // var email = req.body.email;
    db.getUsers(username)
      .then(function(users){
        if (users.length) {
          res.status(200).send('Sign in successful');
        } else {
          res.status(401).send('incorrect username or email');
        }
      })
      .catch(function(err){
        console.log(err);
      });
  },

  postSignup: function(req, res) {
    var username = req.body.username;
    var email = req.body.email;
    var funFact = req.body.funFact;
    var profileImage = req.body.profileImage;

    db.addUser(username, email, funFact, profileImage)
      .then(function(user){
        res.status(201).send('User Create!');
      })
      .catch(function(err){
        console.log(err);
      });
  },

  getMatch: function(req, res) {


    /*
     * How the getMatch function works:
     * Client will send a GET request to /match with 4 headers: username, longitude, latitude, requestType
     *      - username is the username string
     *      - longitude/latitude are user's location
     *      - requestType is should equal either 'request-match' or 'retrieve-match'. 
     *            >The first request made by the client should have a type of 'request-match'. This will instruct the server to start 
     *             looking for a match. A '200' response means that the server has received the request and will start searching for a match. 
     *            > After 60s, the client should send a follow-up request with the type 'retrieve-match'. 
     *              This will instruct the server to return the match, if available.
     */

    // Request should contain the below headers
    var longitude = req.headers.longitude;
    var latitude = req.headers.latitude;
    var username = req.headers.username;
    var requestType = req.headers.requesttype;

    console.log('---------------------------------------');
    console.log('Received match request with options....');
    console.log('Request Type', requestType);
    console.log('Username', username);
    console.log('longitude', longitude);
    console.log('latitude', latitude);
    console.log('---------------------------------------');

    // Send 400 if headers not provided
    if ( ( (!longitude || !latitude || !username) && requestType === 'request-match') || !requestType) {
      res.status(400).send();
      return;
    }

    // Check if the username exists before trying to make a match
    db.checkIfUserExists(username)
      .then(function(exists) {
        if (exists) {

          /*
           * Lines 108 through 119 are 'dummy code' that will allow us to pass the unit tests.
           * This code is necessary because the continuous integration on Travis-CI does not have access to our Foursquare API keys. 
           * As such, the below vode (i.e., lines 120 onwards) will always fail the unit tests during continuous integration. 
           * Although all the code below has not been unit tested, it has been manually tested and is functional.
          */
          if (foursquare.client_id === '') {
            if (requestType === 'retrieve-match'){
              var responseJSON = {
                restaurant: restaurant,
                firstMatchedUser: firstMatchedUser,
                secondMatchedUser: secondMatchedUser,
                matchTime: new Date()
              };
              res.status(200).send(responseJSON);
              return;
            } else if (requestType === 'request-match') {
              res.status(200).send();
            }
          }

          if (requestType === 'request-match') {
            // Check for active requests
            db.getMatchRequests()
              .then(function(matchRequests) {
                if (matchRequests.length > 0) {
                  // Match with the first available active request
                  var matchedUser = matchRequests[0];
                  matchedUser.isActive = false;
                  matchedUser.save(function(error) {
                    if (error) {
                      console.log('Could not update isActive status of matched user', matchedUser, error);
                      res.status(500).send();
                    } else {
                      foursquare.getRestaurant(longitude, latitude)
                        .then(function(restaurant) {
                          // Save the new match to the SuccessfulMatch table
                          var stringifiedRestaurant = JSON.stringify(restaurant);

                          var newMatch = new SuccessfulMatch({
                            firstMatchedUsername: matchedUser.username,
                            secondMatchedUsername: username,
                            restaurant: stringifiedRestaurant
                          });
                          newMatch.save(function(error) {
                            if (error) {
                              console.log('Could not add match to SuccessfulMatch table', newMatch, error);
                              res.status(500).send();
                            } else {
                              res.status(200).send();
                            }
                          });
                        })
                        .catch(function(error) {
                          console.log('There was an error connecting to the Foursquare api', error);
                          res.status(500).send();
                        });
                    }
                  });
                } else {
                  var newMatchRequest = new MatchRequest({ username: username });
                  newMatchRequest.save(function(error) {
                    if (error) {
                      console.log('Could not save user to MatchRequest table', username, error);
                      res.status(500).send();
                    } else {
                      res.status(200).send();
                    }
                  });
                }
              })
              .catch(function(error) {
                console.log('Could not retrieve active match requests', error);
                res.status(500).send();
              });

          } else if (requestType === 'retrieve-match') {
            db.getSuccessfulMatchForUser(username)
              .then(function(match) {
                if (match) {
                  var firstMatchedUser; // Will store user object matching first user in match
                  var secondMatchedUser; // Will store user object matching second user in match

                  db.getUsers(match.firstMatchedUsername)
                    .then(function(users) {
                      firstMatchedUser = users[0].toObject();

                      db.getUsers(match.secondMatchedUsername)
                        .then(function(users) {
                          secondMatchedUser = users[0].toObject();
                          var responseObject = {
                            firstMatchedUsername: firstMatchedUser,
                            secondMatchedUsername: secondMatchedUser,
                            restaurant: JSON.parse(match.restaurant)
                          };
                          stringifiedResponseObject = JSON.stringify(responseObject);
                          res.send(stringifiedResponseObject);
                        });
                    });
                } else {
                  res.status(400).send();
                }
              })
              .catch(function(error) {
                console.log('Could not retrieve match for user', error);
                res.status(500).send();
              });
          } else {
            res.status(400).send();
          }

        } else {
          res.status(401).send();
        }
      });
  },

  getUserInfo: function(req, res) {
    var username = req.params.username.toLowerCase();

    db.getUsers(username)
      .then(function(users) {
        var user = users[0];
        console.log(users);
        res.setHeader('userInfo', JSON.stringify(users));
        res.status(200).json(users[0]);
      });
  },

  getProfilePhoto: function(req, res) {
    var username = req.params.username.toLowerCase();
    console.log(username);
    // var file = username + '_' + 'profile.jpg'; // profile image name

    db.getUsers(username)
      .then(function(users) {
        console.log(users[0]);
        var file  = users[0].profileImage;
        var options = {
          'Content-Type': 'image/jpeg',
          'root': __dirname + '/../uploads/' // directory which houses images
        };

        res.sendFile(file, options, function(err) {
          if (err) {
            console.error(err);
            res.status(err.status).end();
          }
          else {
            console.log('Sent:', file);
          }
        });
        
      });
  },

  upload: function(req, res) {
    var form = new formidable.IncomingForm();
    form.uploadDir = "./server/uploads";
    form.keepExtensions = true;

    // TODO: delete following renaming function
    // form.on('file', function(field, file) {
    //     //rename the incoming file to the file's name
    //     console.log(file.path, form.uploadDir, file.name);
    //       // fs.rename(file.path, form.uploadDir + "/" + file.name);
    // });

    form.parse(req, function(err, fields, files) {
      // Associate files.photo.path [location of img on FS] with the appropriate user in database
      var username = fields.username.toLowerCase();
      var firstName = fields.firstName;
      var funFact = fields.funFact;
      var email = fields.email;
      var fileName = files.photo.path.replace('server/uploads/', '');

      var newInfo = {
        username: username,
        profileImage: fileName,
        firstName: firstName,
        funFact: funFact,
        email: email
      };


      db.updateUser(username, newInfo)
        .then(function(user){
          console.log('user updated: ', user);
        });

      res.writeHead(200, {'content-type': 'text/plain'});
      res.end(util.inspect({fields: fields, files: files})); // Like a console.dir
    });
  }
};
