/* 
NOTE: Some code is borrowed from the three.js map controls example.
*/

import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/ModifiedControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { towns } from './towns.js';

let camera, controls, goodSound, selectSound, scene, renderer, raycaster, clock, floorMesh, sphere, railScene, trainScene, stationSignScene, currentJourney, generatedTownNames;
let toggle = 0;
let splinePoints = []; // Points of the *current* rail spline being drawn
let intersection = null; // Raycast intersection from mouse on floor
let splineUuid = null;
let railUuids = [];
let railSplines = [];
let railPlacement = false;
let drawnNodes = [];
let extendingExistingRail = false;
let journeyPlacement = false;
let manageMenu = false;
let stations = []; // pairs of nodes, representing the start and end of a station (platforms)
let stationDemands = {}; // Demand and people waiting for each station
let journeys = [];
let selectedPlatform = null;
let trains = [];
let selectedJourney = 0;
let timeElapsed = 0.0;
let score = 0;
let paused = false;

const mouse = new THREE.Vector2();

init();
animate();

// Update mouse position on mouse move
function onMouseMove( event ) {
  mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
  mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}

// Update window size on window resize
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
}

/* Toolbar button presses */

// Mousedown - handles clicks that are not on buttons.
function onMouseDown(event) {
  // selectSound.play();
  if (railPlacement) { // if we're placing a rail
    setTimeout(function() { // manage timings with mousedown event vs button click event
      if (railPlacement) {
        handleRailPlacementMouseDown(event);
      }
    }, 100);
  } else if (journeyPlacement) { // if we're placing a journey  
    setTimeout(function() { // manage timings with mousedown event vs button click event
      if (journeyPlacement) {
        handleJourneyCreationMouseDown(event);
      }
    }, 100);
  }
}

// Handles what to do when clicking in rail placement mode.
function handleRailPlacementMouseDown(event) {
  if (event.button === 0 && document.getElementById("info").innerHTML != "Invalid curve!") {
    const getPointResult = getPointToDrawFrom();
    intersection = getPointResult.intersection;
    const sphereIntersectionInfo = getPointResult.sphereIntersectionInfo;

    if (extendingExistingRail) { // if we're extending an existing rail
      // Figure out how to extend the existing spline
      let railIndex = sphereIntersectionInfo.railIndex;
      let nodeIndex = sphereIntersectionInfo.nodeIndex;
      let rail = railSplines[railIndex].points;

      // If starting from nothing:
      if (splinePoints.length <= 1) { // If starting from nothing
        if (nodeIndex === 0) { // extending from start of a spline
          rail = rail.reverse();
          railSplines.splice(railIndex, 1);
          splinePoints = rail;
        } else if (nodeIndex === rail.length - 1) { // extending from end of a spline
          railSplines.splice(railIndex, 1);
          splinePoints = rail;
        } else { // extending from middle of a spline
          console.log("Unimplemented");
        }

      } else { // If some points have alreday been drawn
        // Need to merge the two splines
        if (nodeIndex === 0) { // extending to start of a spline
          const possibleSplinePoints = splinePoints.concat(rail);
          if (splineBendValid(possibleSplinePoints)) {
            railSplines.splice(railIndex, 1);
            splinePoints = possibleSplinePoints;
          } else {
            console.log("Bend too sharp!!!");
          }
        } else if (nodeIndex === rail.length - 1) { // extending to end of a spline
          // splinePoints = splinePoints.reverse();
          const possibleSplinePoints = rail.concat(splinePoints.slice().reverse());
          if (splineBendValid(possibleSplinePoints)) {
            railSplines.splice(railIndex, 1);
            splinePoints = possibleSplinePoints;
          } else {
            console.log("Bend too sharp!!!");
          }
        } else { // extending to middle of a spline
          console.log("Unimplemented");
        }
        // Stop placement here
        railButtonToggle();
      }
    }

    else if (intersection !== null) { // If we're not extending an existing rail
      // Add to spline points
      splinePoints.push(new THREE.Vector3(
        intersection.point.x,
        intersection.point.y + 2,
        intersection.point.z
      ));
    }
  }
}

// Handles what to do when clicking in journey placement mode.
function handleJourneyCreationMouseDown() {
  if (selectedPlatform === null) { return; } // Do nothing if mouse not over a platform.

  if (currentJourney.stations.length === 0) { // if adding first station to journey
    currentJourney.stations.push(selectedPlatform);
    currentJourney.stationLengths.push(0);
    const curve = new THREE.CatmullRomCurve3([selectedPlatform.points[0], selectedPlatform.points[1]], false, 'catmullrom', 0.5);
    currentJourney.points = curve.getSpacedPoints(Math.floor(curve.getLength() / 6));

    // Retrieve the spline that the station is on, and add it to the current journey
    for (let i = 0; i < railSplines.length; i++) {
      const railSpline = railSplines[i].points;
      if (railSpline.includes(selectedPlatform.points[0])) {
        currentJourney.activeSpline = railSpline;
        break;
      }
    }
  } else { // if adding next (2nd+) station to journey
    // Check if the station is on the same spline as the previous station
    if (currentJourney.activeSpline.includes(selectedPlatform.points[0])) {
      // push all nodes between the last station and this station
      const lastStation = currentJourney.stations[currentJourney.stations.length - 1];
      const lastStationIndex = currentJourney.activeSpline.indexOf(lastStation.points[0]);
      const thisStationIndex = currentJourney.activeSpline.indexOf(selectedPlatform.points[0]);

      // Handling selecting both ways down the spline
      var nodesToAdd;
      if (lastStationIndex === thisStationIndex) {
        console.log("Cannot select same station twice"); 
        return; // if the same station is selected twice
      } else if (lastStationIndex < thisStationIndex) {
        nodesToAdd = currentJourney.activeSpline.slice(lastStationIndex, thisStationIndex + 1);
      } else { // if the station is selected in reverse order
        nodesToAdd = currentJourney.activeSpline.slice(thisStationIndex, lastStationIndex + 1).reverse();
      }
      currentJourney.nodes = currentJourney.nodes.slice(0,-1).concat(nodesToAdd);
      currentJourney.stations.push(selectedPlatform);

      // Calculate lengths, to use later when determining if a train has visited a station
      const curve = new THREE.CatmullRomCurve3(currentJourney.nodes, false, 'catmullrom', 0.5);
      currentJourney.stationLengths.push(curve.getLength());
      currentJourney.points = curve.getSpacedPoints(Math.floor(curve.getLength() / 6));
    } else {
      // Warn in console if the station is not on the same spline as the previous station
      console.log("Not on the same spline");
    }
  }  
}

/* Button toggle functions */

function calculateRailSplinePoints(pts) {
  var curve = null;
  var spacedPoints = null;
  if (pts.length > 1) {
    // Calculate the spline points, spaced
    curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    if (curve != undefined) {
      try {
        spacedPoints = curve.getSpacedPoints(Math.floor(curve.getLength() / 6));
      } catch (e) {
        spacedPoints = pts;
      }
      
    }
  }
  return { points: pts, curve: curve, spacedPoints: spacedPoints };
}

// Handles rail button click
function railButtonToggle() {
  // Disable any other modes
  if (journeyPlacement) {
    journeyButtonToggle();
  } else if (manageMenu) {
    manageButtonToggle();
  } else if (paused) {
    pauseButtonToggle();
  }

  // Toggle rail placement
  railPlacement = !railPlacement;

  if (railPlacement) {
    // Start placing
    document.getElementById("rail-button").innerHTML = "Stop Placing Rails";
  } else {
    // Stop placing
    // Push current spline points to railSplines
    if (splinePoints.length > 1) { // if there are at least 2 points in the spline
      railSplines.push(calculateRailSplinePoints(splinePoints));
    }
    splinePoints = [];
    document.getElementById("rail-button").innerHTML = "Place Rails";
  }
}

// Handles journey button click
function journeyButtonToggle() {
  // Disable any other modes
  if (railPlacement) {
    railButtonToggle();
  } else if (manageMenu) {
    manageButtonToggle();
  } else if (paused) {
    pauseButtonToggle();
  }

  // Toggle journey placement
  journeyPlacement = !journeyPlacement;

  if (journeyPlacement) {
    // Start placing journeys
    stations.map(station => scene.add(station.blockToDraw)); // draw platforms
    currentJourney = { stations: [], stationLengths: [], activeSpline: null, nodes: [], points: []} // instantiate journey
    document.getElementById("journey-button").innerHTML = "Finish Journey";
    document.getElementById("info").innerHTML = "Choose a station to start at";
  } else {
    stations.map(station => scene.remove(station.blockToDraw));
    if (currentJourney.stations.length > 1) {
      // conclude the journey
      currentJourney.frequency = 20 + getRandomInt(-5, 5);
      currentJourney.lastTrain = 0;
      for (let i = 0; i < currentJourney.stationLengths.length; i++) {
        currentJourney.stationLengths[i] = currentJourney.stationLengths[i] / currentJourney.stationLengths.at(-1);
      }
      journeys.push(currentJourney); // push the journey to the journeys array
      generateManageMenuHeader();
    }
    currentJourney = null;
    document.getElementById("journey-button").innerHTML = "Create Journey";
  }
}

// Handles manage button click
function manageButtonToggle() {
  // Disable any other modes
  if (journeyPlacement) {
    journeyButtonToggle();
  } else if (railPlacement) {
    railButtonToggle();
  } else if (paused) {
    pauseButtonToggle();
  }

  // Toggle manage menu
  manageMenu = !manageMenu;
  
  if (manageMenu) {
    document.getElementById("manage-button").innerHTML = "Close Menu";
    document.getElementById("journey-editor").style.display = "block";
  } else {
    document.getElementById("manage-button").innerHTML = "Manage Journeys";
    document.getElementById("journey-editor").style.display = "none";
  }
  
}

// Handles pause button click
function pauseButtonToggle() {
  paused = !paused;
}

/* Manage menu functions - dynamically generated */

// Generates the selection box and button for the manage menu
function generateManageMenuHeader(value) {
  if (journeys.length === 0) {
    document.getElementById("journey-editor").innerHTML = "No journeys to edit";
    return;
  }

  // Generate the selection box and button
  document.getElementById("journey-editor").innerHTML = `
    <label for="journey-select">Select a journey to edit:</label>
    <select class="button-35" name="journey-select" id="journey-select">
      ${journeys.map((journey, index) => `<option value="${index}">Journey ${index + 1} (${journey.stations[0].name} - ${journey.stations.at(-1).name})</option>`)}
    </select>
    <button class="button-35" id="retrieve-button">Manage</button>
    <div id="journey-info"></div>
  `;
  document.getElementById("journey-info").innerHTML = "";

  document.getElementById("retrieve-button").addEventListener("click", generateManageMenu, false);
}

// Generate the manage menu for the selected journey
function generateManageMenu() {
  selectedJourney = document.getElementById("journey-select").value;
  const journey = journeys[selectedJourney];

  // list of stations
  document.getElementById("journey-info").innerHTML = `
    <div id="journey-${selectedJourney}">
      <p>${journey.stations.map(station => station.name + " (" + station.platform + ")").join(" · ")}</p>
      <label for="frequency-${selectedJourney}">Frequency:</label>
      <input class="button-35" type="number" id="frequency-${selectedJourney}" name="frequency-${selectedJourney}" min="5" max="120" value="${journey.frequency}">
      <button class="button-35" id="update-frequency-${selectedJourney}">Update Frequency</button>
      <br><br>
      <button class="button-35" id="delete-journey-${selectedJourney}">Delete Journey</button>
    </div>
  `;

  // add event listeners for the buttons
  document.getElementById("delete-journey-" + selectedJourney).addEventListener("click", () => { deleteJourney(selectedJourney); }, false);
  document.getElementById("update-frequency-" + selectedJourney).addEventListener("click", () => { updateFrequency(selectedJourney); }, false);

}

// Delete a journey
function deleteJourney(journeyIndex) {
  for (let i = 0; i < trains.length; i++) {
    // remove trains on the journey
    if (trains[i].journey === journeys[journeyIndex]) {
      scene.remove(trains[i].model);
      trains.splice(i, 1);
    }
  }
  journeys.splice(journeyIndex, 1);
  generateManageMenuHeader();
}

// Update the frequency of a journey
function updateFrequency(journeyIndex) {
  const frequency = document.getElementById("frequency-" + journeyIndex).value;
  if (frequency >= 5 || frequency <= 120) {
    journeys[journeyIndex].frequency = frequency;
  }
  generateManageMenuHeader();
}


// The big setup function - instantiates the environment
function init() {
  // Set up the scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color( 0xcccccc );
  scene.fog = new THREE.FogExp2( 0xcccccc, 0.0001 );
  clock = new THREE.Clock();

  // Set up the renderer 
  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize( window.innerWidth, window.innerHeight );
  document.body.appendChild( renderer.domElement );

  // Set up the raycaster
  raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.1;

  // Set up the camera
  camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 4000 );
  camera.position.set( 400, 200, 0 );

  // Model for nodes rendered on tracks
  const sphereGeometry = new THREE.SphereGeometry( 10, 3, 3 );
  const sphereMaterial = new THREE.MeshBasicMaterial( { color: 0xffffff } );
  sphere = new THREE.Mesh( sphereGeometry, sphereMaterial );
  sphere.position.copy(0, 0, 0);
  scene.add( sphere );

  // controls
  controls = new MapControls( camera, renderer.domElement );
  controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
  controls.dampingFactor = 0.2;
  controls.screenSpacePanning = false;
  controls.minDistance = 100;
  controls.maxDistance = 3000;
  controls.maxPolarAngle = Math.PI / 2;

  // Set up sound
  let listener = new THREE.AudioListener();
  camera.add( listener );

  // create a global audio source
  goodSound = new THREE.Audio( listener );
  selectSound = new THREE.Audio( listener );

  // load a sound and set it as the Audio object's buffer
  const audioLoader = new THREE.AudioLoader();
  audioLoader.load( '../assets/sfx/goodSound.wav', function( buffer ) {
    goodSound.setBuffer( buffer );
    goodSound.setVolume( 1 );
  });
  audioLoader.load( '../assets/sfx/select.wav', function( buffer ) {
    selectSound.setBuffer( buffer );
    selectSound.setVolume( 1 );
  });

  // Create floor
  var xwidth = 5000;
  var zwidth = 5000;
  var floorGeometry = new THREE.PlaneGeometry( xwidth, zwidth, 1, 1 );
  let pos = floorGeometry.attributes.position;
  pos.needsUpdate = true;

  const floorMaterial1 = new THREE.MeshPhongMaterial( { color: 0x2bd42b, flatShading: true, shininess: 10 } );
  floorMesh = new THREE.Mesh( floorGeometry, floorMaterial1 );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -0.5;

  scene.add(floorMesh);

  // Load external 3d models
  document.getElementById("info").innerHTML = "Loading models...";

  // Loader for FBX models
  const loader2 = new FBXLoader();
  loader2.load('../assets/models/Nature/FBX/BirchTree_1.fbx', function(fbx) {
    fbx.scale.set(0.2,0.2,0.2);
    fbx.position.set(50, 0, 50);
    for (var i = 0; i < 100; i++) {
      var tree = fbx.clone();
      tree.position.set(getRandomInt(-xwidth/2, xwidth/2), 0, getRandomInt(-zwidth/2, zwidth/2));
      tree.rotation.y = getRandomInt(0, 360)/180*Math.PI;
      scene.add(tree);
    }
  });

  var streets = {};
  loader2.load('../assets/models/Streets/FBX/Street_Straight.fbx', function(fbx) {
    fbx.scale.set(0.5,0.5,0.5);
    fbx.position.set(50, 0, 50);
    streets["straight"] = fbx;
  });

  loader2.load('../assets/models/Streets/FBX/Street_3Way.fbx', function(fbx) { // Not triangulated
    fbx.scale.set(0.5,0.5,0.5);
    fbx.position.set(50, 0, 50);
    streets["t"] = fbx;
  });


  // Loader for glb models (incl. blender exported)
  const loader = new GLTFLoader();

  loader.load('../assets/models/train.glb', function(gltf) {
    trainScene = gltf.scene;
    gltf.scene.scale.set(5,5,5);
  }, undefined, function(error) {
    console.error(error);
  });

  loader.load('../assets/models/rail.glb', function(gltf) {
    railScene = gltf.scene;
    railScene.scale.set(5,5,5);
  }, undefined, function(error) {
    console.error(error);
  });

  loader.load('../assets/models/station_sign.glb', function(gltf) {
    stationSignScene = gltf.scene;
    stationSignScene.scale.set(10,10,10);
  }, undefined, function(error) {
    console.error(error);
  });

  // Bulk import building models
  const buildings = [
    "Building1_Small.glb",
    "Building2_Large.glb",
    "Building2_Small.glb",
    "Building3_Big.glb",
    "Building3_Small.glb",
    "Building4.glb",
    "House1.glb", 
    "House2.glb"
  ];

  var buildingModels = new Array();
  
  for (const building in buildings) {
    loader.load('../assets/models/Buildings/GLTF/' + buildings[building], function(gltf) {
      gltf.scene.scale.set(20,20,20);
      buildingModels.push(gltf.scene);
      if (buildingModels.length == buildings.length) {
        setTimeout(() => { // Give time for models to import before using them
          document.getElementById("info").innerHTML = "Generating towns...";
          for (var i = 0; i < 6; i++) {
            generateTown(buildingModels, streets, getRandomInt(-(xwidth-500)/2, (xwidth-500)/2), getRandomInt(-(zwidth-500)/2, (zwidth-500)/2), Math.random() * 2 * Math.PI);
          }
          
          // Generate station demands for later use
          generatedTownNames = Object.keys(stationDemands);
          for (const name of generatedTownNames) {
            stationDemands[name].demand[name] = 0;
            for (const name2 of generatedTownNames) {
              if (name != name2) {
                stationDemands[name].demand[name2] = Math.random();
              }
              stationDemands[name].waiting[name2] = 0;
            }
          }

          // Towns generated!
          document.getElementById("info").innerHTML = "";
        }, 200);
      }
    });
  }

  // lights

  // Daylight colours
  const dirLight1 = new THREE.DirectionalLight( 0xfef9ff );
  dirLight1.position.set( 1, 1, 1 );
  scene.add( dirLight1 );

  // Sunset colours
  const dirLight2 = new THREE.DirectionalLight( 0x884422 );
  dirLight2.position.set( - 1, - 1, - 1 );
  scene.add( dirLight2 );

  // And a little bit of *ambience*
  const ambientLight = new THREE.AmbientLight( 0x222222 );
  scene.add( ambientLight );

  // Add listeners for button pressed etc
  window.addEventListener( 'resize', onWindowResize );
  window.addEventListener( 'mousemove', onMouseMove );
  window.addEventListener( 'mousedown', (event) => { onMouseDown(event); } );
  document.getElementById("rail-button").addEventListener("click", railButtonToggle, false);
  document.getElementById("journey-button").addEventListener("click", journeyButtonToggle, false);
  document.getElementById("manage-button").addEventListener("click", manageButtonToggle, false);
  document.getElementById("pause-button").addEventListener("click", pauseButtonToggle, false);

  document.getElementById("journey-editor").style.display = "none";
  document.getElementById("journey-editor").innerHTML = "No journeys to edit";
}

// Helper for later to get even distribution of random numbers
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate a town using the imported buildings
function generateTown(buildings, streets, xOffset, zOffset, rot) {
  var x = 0;
  var z = 0;
  var val = buildings.at(0);

  // Calculate where to place buildings
  var locations = [{x: 0, z: 0, rotation: 0}];
  var street_places = [];
  var left = getRandomInt(1, 2);
  var right = getRandomInt(1, 2);
  var generateT = getRandomInt(0, 1) == 1 ? true : false;
  var forward = getRandomInt(2, 2);
  const houseWidth = 100;
  const streetwidth = 120;

  // Generate the locations of the buildings
  // To the left of the station:
  for (var i = (generateT ? 1 : 0); i <= left; i++) {
    locations.push({x: -i * houseWidth, z: z, rotation: 0});
    locations.push({x: -i * houseWidth, z: z + streetwidth, rotation: Math.PI });
    street_places.push({x: -i * houseWidth, z: z + streetwidth/2, rotation: Math.PI });
  }

  // To the right of the station:
  for (var i = 1; i <= right; i++) {
    locations.push({x: i * houseWidth, z: z, rotation: 0});
    locations.push({x: i * houseWidth, z: z + streetwidth, rotation: Math.PI });
    street_places.push({x: i * houseWidth, z: z + streetwidth/2, rotation: Math.PI });
  }

  // On the T in front of the station:
  if (generateT) {
    street_places.push({x: x, z: z + 60 + houseWidth, rotation: Math.PI/2 });
    for (var i = 2; i <= forward; i++) {
      locations.push({x: x - streetwidth/2, z: streetwidth/2 + z + i * houseWidth, rotation: Math.PI/2});
      locations.push({x: x + streetwidth/2, z: streetwidth/2 + z + i * houseWidth, rotation: Math.PI * 1.5});
      street_places.push({x: x, z: streetwidth/2 + z + i * houseWidth, rotation: Math.PI/2 });
    }
  }

  // Place buildings
  for (const location in locations) {
    var building = buildings[getRandomInt(0, buildings.length - 1)].clone();
    building.position.set(locations[location].x, 0, locations[location].z);
    building.rotation.y = locations[location].rotation;
    if (rot != 0) {
      // rotate around the point (x,z)
      var newX = (locations[location].x - x) * Math.cos(rot) - (locations[location].z - z) * Math.sin(rot) + x;
      var newZ = (locations[location].x - x) * Math.sin(rot) + (locations[location].z - z) * Math.cos(rot) + z;
      building.position.set(newX + xOffset, 0, newZ + zOffset);
      building.rotation.y = locations[location].rotation - rot;
    } else {
      building.position.set(locations[location].x + xOffset, 0, locations[location].z + zOffset);
    }
    scene.add(building);
  }

  // Place streets
  // Place the T road if needed
  if (generateT) {
    var tStreet = streets["t"].clone();
    tStreet.position.set(0, 0, z + 60);
    tStreet.rotation.y = Math.PI/2;
    if (rot != 0) {
      // rotate around the point (x,z)
      var newX = (0 - x) * Math.cos(rot) - (z + 60 - z) * Math.sin(rot) + x;
      var newZ = (0 - x) * Math.sin(rot) + (z + 60 - z) * Math.cos(rot) + z;
      tStreet.position.set(newX + xOffset, 0, newZ + zOffset);
      tStreet.rotation.y = Math.PI/2 - rot;
    } else {
      tStreet.position.set(0 + xOffset, 0, z + 60 + zOffset);
    }
    scene.add(tStreet);
  }

  // Place straight roads
  for (const street in street_places) {
    var newStreet = streets["straight"].clone();
    newStreet.position.set(street_places[street].x, 0, street_places[street].z);
    newStreet.rotation.y = street_places[street].rotation;
    if (rot != 0) {
      // rotate around the point (x,z)
      var newX = (street_places[street].x - x) * Math.cos(rot) - (street_places[street].z - z) * Math.sin(rot) + x;
      var newZ = (street_places[street].x - x) * Math.sin(rot) + (street_places[street].z - z) * Math.cos(rot) + z;
      newStreet.position.set(newX + xOffset, 0, newZ + zOffset);
      newStreet.rotation.y = street_places[street].rotation - rot;
    } else {
      newStreet.position.set(street_places[street].x + xOffset, 0, street_places[street].z + zOffset);
    }
    scene.add(newStreet);
  }

  // Add station sign
  var stationSign = stationSignScene.clone();
  stationSign.position.set(x, 0, z - 60);
  if (rot != 0) {
    // rotate around the point (x,z)
    var newX = (x - x) * Math.cos(rot) - (z - 60 - z) * Math.sin(rot) + x;
    var newZ = (x - x) * Math.sin(rot) + (z - 60 - z) * Math.cos(rot) + z;
    stationSign.position.set(newX + xOffset, 0, newZ + zOffset);
    stationSign.rotation.y = -rot;
  } else {
    stationSign.position.set(x + xOffset, 0, z - 60 + zOffset);
  }
  scene.add(stationSign);

  // Calculate where to place rails
  const railWidth = 20;
  const offsets = [-6*railWidth, 6*railWidth];
  var railPositions1 = [];
  var railPositions2 = [];
  for (let i = 0; i < offsets.length; i++) {
    railPositions1.push({x: x + offsets[i], z: z - 100, rotation: 0});
  }
  for (let i = 0; i < offsets.length; i++) {
    railPositions2.push({x: x + offsets[i], z: z - 140, rotation: 0});
  }

  // Put the rails in a rail spline, just like user placed ones
  var spline1 = [];
  var spline2 = [];
  for (let i = 0; i < railPositions1.length; i++) {
    if (rot != 0) {
      // rotate around the point (x,z)
      var newX = (railPositions1[i].x - x) * Math.cos(rot) - (railPositions1[i].z - z) * Math.sin(rot) + x;
      var newZ = (railPositions1[i].x - x) * Math.sin(rot) + (railPositions1[i].z - z) * Math.cos(rot) + z;
      spline1.push(new THREE.Vector3(newX + xOffset, 0, newZ + zOffset));
    } else {
      spline1.push(new THREE.Vector3(railPositions1[i].x + xOffset, 0, railPositions1[i].z + zOffset));
    }
  }

  for (let i = 0; i < railPositions2.length; i++) {
    if (rot != 0) {
      // rotate around the point (x,z)
      var newX = (railPositions2[i].x - x) * Math.cos(rot) - (railPositions2[i].z - z) * Math.sin(rot) + x;
      var newZ = (railPositions2[i].x - x) * Math.sin(rot) + (railPositions2[i].z - z) * Math.cos(rot) + z;
      spline2.push(new THREE.Vector3(newX + xOffset, 0, newZ + zOffset));
    } else {
      spline2.push(new THREE.Vector3(railPositions2[i].x + xOffset, 0, railPositions2[i].z + zOffset));
    }
  }

  // Add spline for station rails
  railSplines.push(calculateRailSplinePoints(spline1));
  railSplines.push(calculateRailSplinePoints(spline2));

  // Add station to stations
  const townName = towns[getRandomInt(0, towns.length-1)];
  towns.splice(towns.indexOf(townName), 1); // remove town from list so it doesn't get used again
  const platformGeometry = new THREE.BoxGeometry(20, 15, 80);

  // Create platforms to be selected in journey placement mode
  const platform1 = new THREE.Mesh(platformGeometry, new THREE.MeshBasicMaterial( {color: 0xffffff} ));
  platform1.position.copy(new THREE.Vector3().lerpVectors(spline1[0], spline1[1], 0.5));
  platform1.rotation.y = Math.PI/2 - rot;
  stations.push({ name: townName, platform: "1", points: spline1, blockToDraw: platform1 });

  const platform2 = new THREE.Mesh(platformGeometry, new THREE.MeshBasicMaterial( {color: 0xffffff} ));
  platform2.position.copy(new THREE.Vector3().lerpVectors(spline2[0], spline2[1], 0.5));
  platform2.rotation.y = Math.PI/2 - rot;
  stations.push({ name: townName, platform: "2", points: spline2, blockToDraw: platform2 });

  // Create entry in stationDemands
  stationDemands[townName] = {demand: {}, waiting: {}};
}

// Animate scene if need be
function animate() {
  requestAnimationFrame( animate );
  controls.update();
  render();
}

// Remove existing rendered rails before rendering new ones
function clearCurrentRails() {
  for (const i in railUuids) {
    const obj = scene.getObjectByProperty('uuid', railUuids[i]);
    scene.remove(obj);
  }
  railUuids = [];
}


// Helper function for looking specifically at the engles of a curve
function railInfoInvalid(railInfo) {
  for (let i=1; i<railInfo.length-1; i++) {
    // Calculate bend
    let vec1 = new THREE.Vector3().subVectors(railInfo[i].point, railInfo[i-1].point);
    let vec2 = new THREE.Vector3().subVectors(railInfo[i].point, railInfo[i+1].point);
    railInfo[i].bend = (vec1.angleTo(vec2) - Math.PI) / Math.PI;
    
    if (Math.abs(railInfo[i].bend) > 0.2) {
      return true;
    } 
  }
  return false;
}

// Check if a rail spline is valid - i.e. if there is a too sharp bend, section too short/long
function splineBendValid(pts) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  
  const length = curve.getLength();
  const railLength = 20;
  const pointsNeeded = Math.floor(length / railLength);
  var us = [];
  for (let i = 0; i < pointsNeeded; i++) {
    us.push((i * railLength) / length);
  }

  var railInfo = [];
  for (const i in us) {
    railInfo.push({ 
      point: curve.getPointAt(us[i]),
      tangent: curve.getTangentAt(us[i]).normalize(),
      bend: 0.0
    });
  }

  return !railInfoInvalid(railInfo);
}

// Draw a line from a set of points, calculating the spline
function drawLineFromPoints(points, colour) {
  try {
    const geometry = new THREE.BufferGeometry().setFromPoints( points );
    const material = new THREE.LineBasicMaterial( { color : colour, linewidth: 100 } );
    const splineObject = new THREE.Line(geometry, material);
    scene.add(splineObject);
    splineUuid = splineObject.uuid;
  } catch (e) {
    console.log(points);
  }
  
}

// Draw rails from a set of points
function drawRails(railSplineInfo, drawSpline) {
  // Generate spline from points
  if (railSplineInfo.points != undefined && railSplineInfo.points.length > 1) {
    const curve = railSplineInfo.curve;
    const spacedPoints = railSplineInfo.spacedPoints;
    if (splineUuid !== null) {
      const obj = scene.getObjectByProperty('uuid', splineUuid);
      obj.geometry.dispose();
      obj.material.dispose();
      scene.remove(obj);
    }

    if (spacedPoints.at(-1) == undefined) {
      return;
    }

    if (drawSpline) {
      drawLineFromPoints(spacedPoints, 0xffffff);
    } else {
      splineUuid = null;
    }
    
    // draw rails
    const length = curve.getLength();
    const railLength = 20;
    const pointsNeeded = Math.floor(length / railLength);
    var us = [];
    for (let i = 0; i < pointsNeeded; i++) {
      us.push((i * railLength) / length);
    }

    var railInfo = [];
    for (const i in us) {
      railInfo.push({ 
        point: curve.getPointAt(us[i]),
        tangent: curve.getTangentAt(us[i]).normalize(),
        bend: 0.0
      });
    }

    var invalidCurve = railInfoInvalid(railInfo);

    // Tell user if bend is too sharp
    if (invalidCurve) {
      document.getElementById("info").innerHTML = "Invalid curve!";
    }

    // Draw rails
    for (const i in railInfo) {
      var newRail = railScene.clone();
      newRail.position.set(railInfo[i].point.x, railInfo[i].point.y, railInfo[i].point.z);
      if (railInfo[i].tangent.z < 0) {
        newRail.rotation.y = Math.acos(railInfo[i].tangent.x, railInfo[i].tangent.y);
      } else {
        newRail.rotation.y = -Math.acos(railInfo[i].tangent.x, railInfo[i].tangent.y);
      }
      
      scene.add(newRail);
      railUuids.push(newRail.uuid);
    }
  }
}

// Draw nodes on rails if in raile placement mode
function drawNodes(splinePoints) {
  for (const i in splinePoints) {
    let thisSphere = sphere.clone();
    thisSphere.position.set(splinePoints[i].x, splinePoints[i].y, splinePoints[i].z);
    scene.add(thisSphere);
    drawnNodes.push(thisSphere);
  }
}

// Clear all drawn nodes on rails before drawing  new ones
function clearDrawnNodes() {
  for (const i in drawnNodes) {
    const obj = scene.getObjectByProperty('uuid', drawnNodes[i].uuid);
    scene.remove(obj);
  }
  drawnNodes = [];
}

// Select a node to connect to
function checkMouseOnNode(mousePoint) {
  for (let i=0; i<railSplines.length; i++) {
    for (let j=0; j<railSplines[i].points.length; j++) {
      const node = railSplines[i].points[j];
      if (Math.abs(node.x - mousePoint.x) < 30 && Math.abs(node.z - mousePoint.z) < 30) {
        return { nodePosition: node, railIndex: i, nodeIndex: j };
      }
    }
  }
  return null;
}

// Get a nearby node, if there is one, else the intersection with the ground
function getPointToDrawFrom() {
  const intersections = raycaster.intersectObjects([floorMesh], false);
  var mouseIntersection = ( intersections.length ) > 0 ? intersections[ 0 ] : null;
  var sphereIntersectionInfo = null;
  if (mouseIntersection !== null && ((sphereIntersectionInfo = checkMouseOnNode(mouseIntersection.point)) !== null)) {
    document.getElementById("info").innerHTML = "Extending existing rail";
    extendingExistingRail = true;
    mouseIntersection.point = sphereIntersectionInfo.node;
  } else {
    extendingExistingRail = false;
  }
  return { intersection: mouseIntersection, sphereIntersectionInfo: sphereIntersectionInfo };
}

// Get the platforms to be selected in the station placement mode
function getIntersectingPlatforms() {
  // get the meshes of the platforms
  const platformObjects = stations.map(station => station.blockToDraw);
  const intersections = raycaster.intersectObjects(platformObjects, false);
  // Make them white if not selected
  for (let i=0; i<platformObjects.length; i++) {
    platformObjects[i].material.color.set(0xffffff);
  }
  if (intersections !== null && intersections.length > 0) {
    // Make the selected one blue
    intersections[0].object.material.color.set(0x0000ff);
    var stationIndex = platformObjects.indexOf(intersections[0].object);
    const waitingHere = Object.values(stationDemands[stations[stationIndex].name].waiting).reduce((a, b) => a + b, 0);
    document.getElementById("info").innerHTML = stations[stationIndex].name + " (Platform " + stations[stationIndex].platform + ") - " + waitingHere + " waiting";
    return stations[stationIndex];
  }
  return null;
}

// Get score by seeing who has been delivered to their station, and who is geting on at the station
function doTrainPeopleSwap(train, stationName) {
  // +1 point for each person delivered to their station
  if (train.onBoard[stationName] > 0) {
    goodSound.play();
  }
  score += train.onBoard[stationName];
  train.onBoard[stationName] = 0;

  const townsEnRoute = train.journey.stations.map(station => station.name).slice(train.visitedStations.length);
  for (const town of townsEnRoute) {
    // get people on the train
    train.onBoard[town] += stationDemands[stationName].waiting[town];
    stationDemands[stationName].waiting[town] = 0;
  }
  
}

// Animate the train by moving to the next point on its journey
function moveTrain(train) {
  if (train.pointIndex < train.journey.points.length - 1) {
    train.pointIndex++;
    train.model.position.copy(train.journey.points[train.pointIndex]);
    try {
      train.model.lookAt(train.journey.points[train.pointIndex+1]);
      train.model.position.y += 13;
    } catch (e) { // reached terminus
      train.visitedStations.push(train.journey.stationLengths.at(-1));
      doTrainPeopleSwap(train, train.journey.stations.at(-1).name);
      // remove train
      scene.remove(train.model);
      trains.splice(trains.indexOf(train), 1);
    }
    train.model.rotation.y -= Math.PI/2;
  }

  // Check if the train has reached a station
  const currentProgress = train.pointIndex / train.journey.points.length;
  for (let i=0; i<train.journey.stationLengths.length; i++) {
    if (currentProgress >= train.journey.stationLengths[i] && !train.visitedStations.includes(train.journey.stationLengths[i])) {
      train.visitedStations.push(train.journey.stationLengths[i]);
      doTrainPeopleSwap(train, train.journey.stations[i].name);
    }
  }
}

// End the game, and show the score
function endGame() {
  document.getElementById("journey-editor").innerHTML = `
  <h1>Game over! Score: ${score}<h1>
  `;
  document.getElementById("journey-editor").style.display = "inline-flex";
  paused = true;
}

// Final rendering method, with a load of checks for good measure =)
function render() {
  // For intersection
  raycaster.setFromCamera( mouse, camera );

  // Remove renders from last cycle
  clearCurrentRails();
  clearDrawnNodes();
  document.getElementById("info").innerHTML = "";

  // Draw the rails and nodes
  for (let i=0; i<railSplines.length; i++) {
    drawRails(railSplines[i], false);
    if (railPlacement) {
      drawNodes(railSplines[i].points);
    }
  }

  // Draw the stations
  if (journeyPlacement && currentJourney != null) {
    if (currentJourney.stations.length < 1) {
      document.getElementById("info").innerHTML = "Pick a station to start from";
    } else {
      document.getElementById("info").innerHTML = "Pick a station";
    }

    selectedPlatform = getIntersectingPlatforms();
    
    // Draw active spline
    if (currentJourney.points.length > 0) {
      drawLineFromPoints(currentJourney.points, 0x0000ff);
    }

  }
  

  // Get the mouse intersection
  if (railPlacement) {
    intersection = getPointToDrawFrom().intersection;
  } else {
    intersection = null;
    drawRails(calculateRailSplinePoints(splinePoints), false);
  }

  // Set up pause variable
  var unpaused = (!paused && !railPlacement && !journeyPlacement && !manageMenu);

  // Update the actively drawn rail spline
  if (intersection !== null) {
    if (intersection.point == undefined) {
      document.getElementById("info").innerHTML = "Joining to existing rail";
      drawRails(calculateRailSplinePoints(splinePoints), true);
    } else {
      // Calculate distance between last 2 points
      let dist = splinePoints.at(-1).distanceTo(intersection.point);
      if (dist < 80) {
        document.getElementById("info").innerHTML = "Invalid curve!"
      }
      drawRails(calculateRailSplinePoints([...splinePoints, intersection.point]), true);
    }
  }
  if (toggle > 0.02) {
    
    if (unpaused) {
      if (trains.length > 0) {
        for (let i=0; i<trains.length; i++) {
          moveTrain(trains[i]);
        }
      }
      // Add people to stations, according to demand, only sometimes
      if (generatedTownNames !== undefined && timeElapsed.toFixed(1) % 1 === 0) {
        for (const townName1 of generatedTownNames) {
          for (const townName2 of generatedTownNames) {
            stationDemands[townName1].waiting[townName2] += (Math.random() < stationDemands[townName1].demand[townName2] ? 1 : 0);
          }
        }
      }
    }
    toggle = 0
  }

  // Update the clock
  let delta = clock.getDelta();
  toggle += delta;

  // Display timer
  var timeInSecs = timeElapsed.toFixed(0);
  document.getElementById("timer").innerHTML = "Time: " + timeInSecs;

  // Animate the trains if unpaused
  if (unpaused) {
    timeElapsed += delta;
    for (let i=0; i<journeys.length; i++) {
      if (journeys[i].lastTrain != timeInSecs && timeInSecs % journeys[i].frequency === 0) {
        // add new train to the start of the journey
        score -= 50;
        journeys[i].lastTrain = timeInSecs;
        let peopleOnBoard = {};
        for (const townName of generatedTownNames) {
          peopleOnBoard[townName] = 0;
        }
        trains.push({ model: trainScene.clone(), journey: journeys[i], pointIndex: 0, visitedStations: [], onBoard: peopleOnBoard })
        scene.add(trains[trains.length - 1].model);
        moveTrain(trains[trains.length - 1]);
      }
    }
  } else {
    document.getElementById("timer").innerHTML += " (Paused)";
  }

  // Make sure info only displays if it needs to
  if (document.getElementById("info").innerHTML == "") {
    document.getElementById("info").style.display = "none";
  } else {
    document.getElementById("info").style.display = "inline-flex";
  }

  // Show score
  document.getElementById("score").innerHTML = "Score: " + score;

  // End the game if the timer runs out
  if (timeElapsed > 500) {
    endGame();
  }

  renderer.render( scene, camera );

}