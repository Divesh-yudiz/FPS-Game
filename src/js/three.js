import * as THREE from 'three';
// eslint-disable-next-line import/no-unresolved
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import * as CANNON from 'cannon';
import fragment from '../shaders/fragment.glsl';
import vertex from '../shaders/vertex.glsl';
import CannonDebugger from 'cannon-es-debugger';
import { gsap } from "gsap";
import { PointerLockControlsCannon } from './PointerLockControlsCannon.js'
// import WebGPURenderer from 'three/addons/renderers/webgpu/WebGPURenderer.js';


const device = {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: window.devicePixelRatio
};

let cityMesh, cityBody, playerMesh, playerBody, avatar, idle, mixer, sittingIdle, standToSit, sitToStand, physicsMaterial, controls
let currentState = "idle"
let ballMeshes = []
let balls = []

export default class Three {
  constructor(canvas) {
    // if ( WebGPU.isAvailable() === false && WebGL.isWebGL2Available() === false ) {

    //   document.body.appendChild( WebGPU.getErrorMessage() );

    //   throw new Error( 'No WebGPU or WebGL2 support' );

    // }
    this.canvas = canvas;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000); // A nice blue sky
    this.camera = new THREE.PerspectiveCamera(
      30,
      device.width / device.height,
      0.1,
      100000
    );
    // this.camera.position.set(5, 10, 2);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(device.width, device.height);
    this.renderer.setPixelRatio(Math.min(device.pixelRatio, 2));

    // this.renderer = new WebGPURenderer({ antialias: true });
    // this.renderer.setPixelRatio(window.devicePixelRatio);
    // this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.controls = new OrbitControls(this.camera, this.canvas);
    // this.controls = new PointerLockControls(this.camera, this.canvas);
    // this.controls = new FirstPersonControls(this.camera, this.renderer.domElement);
    // this.controls.movementSpeed = 8;
    // this.controls.lookSpeed = 0.08;

    this.clock = new THREE.Clock();


    this.world = new CANNON.World();

    this.world.gravity.set(0, -200, 0); // Set gravity

    this.cannonDebugRenderer = new CannonDebugger(this.scene, this.world);

    this.setLights();
    this.setGeometry();
    this.render();

    this.setResize();
  }

  updateCamera() {
    this.camera.position.copy(avatar.position); // Set camera position to player position
    this.camera.position.y += 500; // Adjust camera height if needed
    this.camera.position.z -= 1000; // Adjust camera height if needed
    this.camera.lookAt(avatar.position); // Make camera look at player

    // Calculate the position two steps ahead of the camera
    const twoStepsAhead = new THREE.Vector3();
    twoStepsAhead.copy(this.camera.position);
    twoStepsAhead.addScaledVector(this.camera.getWorldDirection(), -2000); // Adjust the distance as needed

    // Update the playerMesh position to be two steps ahead of the camera
    playerMesh.position.copy(twoStepsAhead);
  }

  initPointerLock() {
    console.log("player is valid :: ", playerMesh)
    controls = new PointerLockControlsCannon(this.camera, this.ballBody, playerMesh)
    this.scene.add(controls.getObject())

    this.canvas.addEventListener('click', () => {
      controls.lock()
    })

    controls.addEventListener('lock', () => {
      controls.enabled = true
    })

    controls.addEventListener('unlock', () => {
      controls.enabled = false
    })
  }

  staticBody({ model, world, bodyType, colliderGroupNames = [], hideColliders = [] }) {
    if (!model || typeof model.traverse !== 'function') {
      console.error('Invalid model: Model is required and must have a traverse method.');
      return;
    }
    if (!world || typeof world.addBody !== 'function') {
      console.error('Invalid world: World is required and must have an addBody method.');
      return;
    }
    model.traverse((child) => {
      const nameIncludesKeywords = (name, keywords) =>
        keywords.length > 0 && keywords.some(keyword => name.toLowerCase().includes(keyword.toLowerCase()));

      if (child.isMesh) {
        if (hideColliders.length > 0 && nameIncludesKeywords(child.parent.name, hideColliders)) {
          child.parent.visible = false;
        }
        if (colliderGroupNames.length === 0 || nameIncludesKeywords(child.parent.name, colliderGroupNames)) {
          const geometry = child.geometry;
          const worldScale = new THREE.Vector3();
          child.getWorldScale(worldScale);
          const vertices = Array.from(geometry.attributes.position.array).map((v, i) => v * worldScale.getComponent(i % 3));
          const indices = geometry.index ? Array.from(geometry.index.array) : [];
          const shape = new CANNON.Trimesh(vertices, indices);

          const worldPosition = new THREE.Vector3();
          const worldQuaternion = new THREE.Quaternion();

          // Create separate bodies for city and player
          const body = new CANNON.Body({ mass: bodyType ? 1 : 0, material: physicsMaterial }); // Player has mass, city doesn't
          body.addShape(shape);

          child.getWorldPosition(worldPosition);
          child.getWorldQuaternion(worldQuaternion);

          body.position.copy(worldPosition);
          body.quaternion.copy(worldQuaternion);

          world.addBody(body);

          // Optionally, you can store these bodies in an array or object for future reference
          if (bodyType == false) {
            cityBody = body;
          } else {
            playerBody = body;
          }
        }
      }
    });
  };


  dynamicBody({ model, world }) {
    if (!model || typeof model.traverse !== 'function') {
      console.error('Invalid model: Model is required and must have a traverse method.');
      return;
    }

    if (!world || typeof world.addBody !== 'function') {
      console.error('Invalid world: World is required and must have an addBody method.');
      return;
    }

    model.traverse((child) => {
      if (child.isMesh) {
        const geometry = child.geometry;
        const worldScale = new THREE.Vector3();
        child.getWorldScale(worldScale);
        const vertices = Array.from(geometry.attributes.position.array).map((v, i) => v * worldScale.getComponent(i % 3));
        const indices = geometry.index ? Array.from(geometry.index.array) : [];
        const shape = new CANNON.Trimesh(vertices, indices);

        const worldPosition = new THREE.Vector3();
        const worldQuaternion = new THREE.Quaternion();

        // Create a dynamic body for the player
        const playerMaterial = new CANNON.Material();
        const body = new CANNON.Body({
          mass: 1,
          shape: shape,
          material: playerMaterial
        });
        child.getWorldPosition(worldPosition);
        child.getWorldQuaternion(worldQuaternion);
        body.position.copy(worldPosition);
        body.quaternion.copy(worldQuaternion);
        world.addBody(body);

        // Store the body for future reference
        playerBody = body;
      }
    });
  };

  setLights() {
    this.ambientLight = new THREE.AmbientLight(new THREE.Color(1, 1, 1, 1));
    this.ambientLight.intensity = 5;
    this.scene.add(this.ambientLight);
  }

  setGeometry() {

    physicsMaterial = new CANNON.Material('physics')
    const physics_physics = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, {
      friction: 100,
      restitution: 0,
    })
    this.world.addContactMaterial(physics_physics)

    // var groundShape = new CANNON.Plane();
    // var groundBody = new CANNON.Body({ mass: 0, material:physicsMaterial}); // Set mass to zero for static body
    // groundBody.addShape(groundShape);
    // groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); // Rotate to match Three.js coordinate system
    // this.world.addBody(groundBody);

    // // Create a Three.js mesh for the ground
    // var groundGeometry = new THREE.PlaneGeometry(100000, 100000);
    // var groundMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    // var groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    // groundMesh.rotation.x = -Math.PI / 2; // Rotate to match Cannon.js coordinate system
    // this.scene.add(groundMesh);
    // groundMesh.visible =  false;


    var loader = new GLTFLoader();
    loader.load(
      'src/assets/city2.glb',
      (gltf) => {
        // Once the model is loaded, add it to the scene
        cityMesh = gltf.scene;
        // cityMesh.scale.set(5, 5, 5)
        console.log(cityMesh)
        this.scene.add(cityMesh);

        // Convert the geometry of the loaded model into a Cannon.js trimesh shape
        // const trimeshShape = new Cannon.Trimesh.createMesh(gltf.scene.children[0].geometry);

        // Create Cannon.js body and associate it with the trimesh shape
        // const cityBody = new Cannon.Body({ mass: 0 });
        // cityBody.addShape(trimeshShape);
        // this.world.addBody(cityBody);

        // Now, apply static body properties to the loaded model
        this.staticBody({
          model: cityMesh,
          world: this.world,
          bodyType: false,
          colliderGroupNames: [], // You can adjust collider group names as needed
          hideColliders: [] // You can adjust hideColliders as needed
        });
      },
      undefined,
      function (error) {
        console.error(error);
      }
    );

    ////////////////For Fbx
    // const fbxLoader = new FBXLoader();
    // fbxLoader.load(
    //   'src\assets\character.fbx', // Path to your FBX model
    //   (object) => {
    //     // You can manipulate the loaded object here if needed
    //     console.log(object)
    //     this.scene.add(object);
    //   },
    //   (xhr) => {
    //     console.log((xhr.loaded / xhr.total) * 100 + '% loaded');
    //   },
    //   (error) => {
    //     console.log('Error loading FBX model:', error);
    //   }
    // );

    loader.load(
      'src/assets/player3.glb',
      (gltf) => {
        // Once the model is loaded, add it to the scene
        playerMesh = gltf.scene;
        // playerMesh.rotation.z = Math.PI / 2; // Rotate the playerMesh by 180 degrees
        console.log(playerMesh)
        this.scene.add(playerMesh);
        this.initPointerLock();

      },
      undefined,
      function (error) {
        console.error(error);
      }
    );

    const radius = 50; // Radius of the hemispheres
    const height = 50; // Height of the cylindrical part
    // const boxShape = new CANNON.Box(new CANNON.Vec3(radius, radius, height / 2));

    const ballShape = new CANNON.Sphere(10);
    this.ballBody = new CANNON.Body({ mass: 100, material: physicsMaterial });
    this.ballBody.addShape(ballShape);
    this.ballBody.position.set(-2800.947, 0, 0); // Start position
    this.ballBody.linearDamping = 0.9
    this.world.addBody(this.ballBody);

    const ballGeometry = new THREE.SphereGeometry(radius, radius, height);
    const ballMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
    this.ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
    this.scene.add(this.ballMesh);
    // this.ballMesh.visible = false




    // // const radius = 1.3
    // sphereShape = new CANNON.Sphere(radius)
    // sphereBody = new CANNON.Body({ mass: 5, material: physicsMaterial })
    // sphereBody.addShape(sphereShape)
    // sphereBody.position.set(0, 5, 0)
    // sphereBody.linearDamping = 0.9
    // world.addBody(sphereBody)


    const fbxLoader = new FBXLoader();
    fbxLoader.load(
      "src/assets/James.fbx",
      (fbx) => {
        avatar = fbx;
        // avatar.position.set(-3.275, -3.7, -0.45);
        // avatar.rotation.set(0, 80, 0);
        // avatar.scale.set(0.01, 0.01, 0.01);
        this.scene.add(avatar);
        mixer = new THREE.AnimationMixer(avatar);

        fbxLoader.load(
          "src/assets/animations/James@Idle.fbx",
          (animFbx) => {
            const idleAnim = animFbx.animations[0];

            idleAnim.tracks = idleAnim.tracks.filter(
              (track) => !track.name.includes(".position.x") && !track.name.includes(".position.z")
            );

            idle = mixer.clipAction(idleAnim);
            idle.play();
          },
          undefined,
          function (error) {
            console.error(error);
          }
        );

        fbxLoader.load(
          "src/assets/animations/James@SittingIdle.fbx",
          (animFbx) => {
            const sittingIdleAnim = animFbx.animations[0];

            sittingIdleAnim.tracks = sittingIdleAnim.tracks.filter(
              (track) => !track.name.includes(".position.x") && !track.name.includes(".position.z")
            );

            sittingIdle = mixer.clipAction(sittingIdleAnim);
          },
          undefined,
          function (error) {
            console.error(error);
          }
        );

        fbxLoader.load(
          "src/assets/animations/James@StandToSit.fbx",
          (animFbx) => {
            const standToSitAnim = animFbx.animations[0];

            standToSitAnim.tracks = standToSitAnim.tracks.filter(
              (track) => !track.name.includes(".position.x") && !track.name.includes(".position.z")
            );

            standToSit = mixer.clipAction(standToSitAnim);
            standToSit.setLoop(THREE.LoopOnce);
            standToSit.clampWhenFinished = true;
          },
          undefined,
          function (error) {
            console.error(error);
          }
        );

        fbxLoader.load(
          "src/assets/animations/James@Walking-1.fbx",
          (animFbx) => {
            const sitToStandAnim = animFbx.animations[0];

            sitToStandAnim.tracks = sitToStandAnim.tracks.filter(
              (track) => !track.name.includes(".position.x") && !track.name.includes(".position.z")
            );

            sitToStand = mixer.clipAction(sitToStandAnim);
            sitToStand.setLoop(true);
            sitToStand.clampWhenFinished = true;

            idle.play();
            currentState = "idle";
          },
          undefined,
          function (error) {
            console.error(error);
          }
        );
      },
      undefined,
      function (error) {
        console.error(error);
      }
    );

    function movePlayerSmoothly(player, newPosition) {
      gsap.to(player.position, {
        duration: 0.9, // duration of animation
        x: newPosition.x,
        z: newPosition.z,
        ease: "power2.out" // easing function for smoother animation
      });
    }

    // document.addEventListener('keydown', (event) => {
    //   const speed = 60;
    //   const rotationSpeed = Math.PI / 4; // Adjust the rotation speed as needed
    //   switch (event.code) {
    //     case 'ArrowUp':
    //       movePlayerSmoothly(this.ballBody, { x: this.ballBody.position.x, z: this.ballBody.position.z + speed });
    //       avatar.rotation.y = 0; // Reset rotation
    //       sitToStand.play()
    //       break;
    //     case 'ArrowDown':
    //       movePlayerSmoothly(this.ballBody, { x: this.ballBody.position.x, z: this.ballBody.position.z - speed });
    //       avatar.rotation.y = Math.PI; // Rotate 180 degrees
    //       sitToStand.play()
    //       break;
    //     case 'ArrowLeft':
    //       movePlayerSmoothly(this.ballBody, { x: this.ballBody.position.x + speed, z: this.ballBody.position.z });
    //       avatar.rotation.y = Math.PI / 2; // Rotate 90 degrees counterclockwise
    //       sitToStand.play()
    //       break;
    //     case 'ArrowRight':
    //       movePlayerSmoothly(this.ballBody, { x: this.ballBody.position.x - speed, z: this.ballBody.position.z });
    //       avatar.rotation.y = -Math.PI / 2; // Rotate 90 degrees clockwise
    //       sitToStand.play()
    //       break;
    //     default:
    //       idle.play()
    //       return;
    //   }
    // });

    // document.addEventListener('keyup', (event) => {
    //   // this.controls.lock();
    //   this.ballBody.quaternion.set(0, 0, 0, 1);
    //   this.ballBody.velocity.set(0, 0, 0);
    //   sitToStand.stop()
    //   idle.play()
    // });

  }

  checkCollisions() {
    const result = new CANNON.RaycastResult();
    const options = {
      collisionFilterMask: 100,
      skipBackfaces: false
    };
    this.world.raycastClosest(playerBody.position, new CANNON.Vec3(0, -1, 0), options, result);
    if (result.hasHit) {
      if (result.body === cityBody) {
        console.log("Collision between player and city detected!");
        this.collided = true; // Set collided to true if collision is detected
      }
    } else {
      this.collided = false; // Reset collided to false if no collision detected
    }
  }


  render() {
    const elapsedTime = this.clock.getElapsedTime();

    this.world.step(1 / 60);
    // this.cannonDebugRenderer.update();

    if (cityMesh && cityBody && playerMesh && playerBody) {
      cityMesh.position.copy(cityBody.position);
      cityMesh.quaternion.copy(cityBody.quaternion);

      // Store the player's current position before checking for collision
      const previousPlayerPosition = playerBody.position.clone();
      const previousPlayerQuaternion = playerBody.quaternion.clone();

      playerMesh.position.copy(playerBody.position);
      playerMesh.quaternion.copy(playerBody.quaternion);

      // Check for collisions
      this.checkCollisions();

      playerMesh.position.copy(this.ballBody.position);

      // If collision is detected, revert player's position to the previous position
      if (this.collided) {
        playerBody.position.copy(previousPlayerPosition);
        playerBody.quaternion.copy(previousPlayerQuaternion);
      }
    }
    const delta = this.clock.getDelta();
    if (this.ballBody && avatar) {
      this.ballMesh.position.copy(this.ballBody.position);
      this.ballMesh.quaternion.copy(this.ballBody.quaternion);
    }
    if (this.ballBody && playerMesh) {
      controls.update(delta)
      // playerMesh.position.x = this.ballBody.position.x
      // playerMesh.position.y = this.ballBody.position.y + 99.5
      // playerMesh.position.z = this.ballBody.position.z - 1

      // console.log(this.camera.position)
      // playerMesh.position.copy(controls.objectInFront.position);

      controls.update(delta)
    }

    if (mixer) {
      mixer.update(delta * 4);
    }
    gsap.updateRoot();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.render.bind(this));
  }


  setResize() {
    window.addEventListener('resize', this.onResize.bind(this));
  }

  onResize() {
    device.width = window.innerWidth;
    device.height = window.innerHeight;

    this.camera.aspect = device.width / device.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(device.width, device.height);
    this.renderer.setPixelRatio(Math.min(device.pixelRatio, 2));
  }
}
