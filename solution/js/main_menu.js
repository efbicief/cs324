import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { MapControls } from 'three/addons/controls/ModifiedControls.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { towns } from './towns.js';

let camera, controls, scene, renderer, raycaster, clock, floorMesh, sphere, splinePoints, railScene, trainScene, stationSignScene, currentJourney, generatedTownNames;


init();
//render(); // remove when using next line for animation loop (requestAnimationFrame)
animate();

function animate() {

  requestAnimationFrame( animate );

  render();

}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color( 0xcccccc );
  scene.fog = new THREE.FogExp2( 0xcccccc, 0.0005 );

  clock = new THREE.Clock();

  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  document.body.appendChild( renderer.domElement );

  camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 4000 );
  camera.position.set( 100, 100, 0 );


  // controls
  controls = new MapControls( camera, renderer.domElement );

  //controls.addEventListener( 'change', render ); // call this only in static scenes (i.e., if there is no animation loop)

  controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
  controls.dampingFactor = 0.2;

  controls.screenSpacePanning = false;

  controls.minDistance = 100;
  controls.maxDistance = 3000;

  controls.maxPolarAngle = Math.PI / 2;


  const loader = new GLTFLoader();

  loader.load('../assets/models/train.glb', function(gltf) {
    trainScene = gltf.scene;
    gltf.scene.scale.set(5,5,5);
    scene.add(trainScene)
  }, undefined, function(error) {
    console.error(error);
  });

  // lights

  const dirLight1 = new THREE.DirectionalLight( 0xfef9ff );
  dirLight1.position.set( 1, 1, 1 );
  scene.add( dirLight1 );

  const ambientLight = new THREE.AmbientLight( 0x222222 );
  scene.add( ambientLight );
}

function render() {

  if (trainScene !== undefined) {
    trainScene.rotation.y += 0.01;
  }

  renderer.render( scene, camera );

}