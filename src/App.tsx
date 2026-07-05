/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { 
  Play, 
  RotateCcw, 
  Info, 
  Gauge, 
  Zap, 
  Award, 
  Navigation, 
  Volume2, 
  VolumeX, 
  AlertTriangle, 
  Users, 
  CheckCircle2, 
  Music,
  ArrowUp,
  ArrowDown,
  Wind
} from 'lucide-react';
import { audio } from './audio';
import { GameState, Particle, Passenger, Signal, Station } from './types';

// Constants
const TRACK_LENGTH = 9000; // Total track length in meters
const PIXELS_PER_METER = 12; // Rendering scale

const STATIONS: Station[] = [
  { id: 'st1', name: 'Greenfield Valley', position: 1200, platformLength: 60, passengerCount: 15, hasVisited: false },
  { id: 'st2', name: 'Highland Junction', position: 2800, platformLength: 60, passengerCount: 22, hasVisited: false },
  { id: 'st3', name: 'Grand Central Station', position: 4400, platformLength: 80, passengerCount: 45, hasVisited: false },
  { id: 'st4', name: 'Industrial Sector 7', position: 6000, platformLength: 60, passengerCount: 18, hasVisited: false },
  { id: 'st5', name: 'Ocean Breeze Terminal', position: 7800, platformLength: 70, passengerCount: 30, hasVisited: false },
];

const SIGNALS: Signal[] = [
  { id: 'sig1', position: 600, state: 'GREEN', timer: 12, durationRed: 8, durationGreen: 12 },
  { id: 'sig2', position: 1900, state: 'GREEN', timer: 10, durationRed: 10, durationGreen: 12 },
  { id: 'sig3', position: 3600, state: 'GREEN', timer: 15, durationRed: 7, durationGreen: 14 },
  { id: 'sig4', position: 5200, state: 'GREEN', timer: 8, durationRed: 9, durationGreen: 11 },
  { id: 'sig5', position: 6800, state: 'GREEN', timer: 11, durationRed: 8, durationGreen: 13 },
];

// Speed Limits (zones of track in meters: { start, end, limit in m/s, label })
const SPEED_LIMIT_ZONES = [
  { start: 1800, end: 2300, limit: 8.33, label: 'Construction Zone (30 km/h)' }, // 30 km/h
  { start: 5000, end: 5500, limit: 11.11, label: 'Mountain Curve (40 km/h)' }, // 40 km/h
  { start: 7100, end: 7500, limit: 6.94, label: 'Bridge Maintenance (25 km/h)' }, // 25 km/h
];

const DEFAULT_SPEED_LIMIT = 16.67; // 60 km/h in m/s

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Game States reflected in React for HUD updates
  const [gameState, setGameState] = useState<GameState>({
    trainPosition: 0,
    trainSpeed: 0,
    trainAcceleration: 0,
    controlState: 'coast',
    energy: 100,
    score: 0,
    distanceTraveled: 0,
    currentStationId: null,
    passengerStatus: 'idle',
    timeElapsed: 0,
    totalTime: 0,
    gameOver: false,
    gameStarted: false,
    statusMessage: 'Ready to drive!',
    statusTimer: 3,
    hornActive: false,
    emergencyBrakeActive: false,
    emergencyBrakeTimer: 0,
    passengersDelivered: 0,
  });

  // Track station list and signals in state as well for display/logic
  const [stations, setStations] = useState<Station[]>(STATIONS);
  const [signals, setSignals] = useState<Signal[]>(SIGNALS);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showInstructions, setShowInstructions] = useState(true);

  // Mutable refs for high frequency physics/render loop to avoid closure problems
  const stateRef = useRef<GameState>({
    trainPosition: 0,
    trainSpeed: 0,
    trainAcceleration: 0,
    controlState: 'coast',
    energy: 100,
    score: 0,
    distanceTraveled: 0,
    currentStationId: null,
    passengerStatus: 'idle',
    timeElapsed: 0,
    totalTime: 0,
    gameOver: false,
    gameStarted: false,
    statusMessage: 'Press UP ARROW to accelerate',
    statusTimer: 4,
    hornActive: false,
    emergencyBrakeActive: false,
    emergencyBrakeTimer: 0,
    passengersDelivered: 0,
  });

  const stationsRef = useRef<Station[]>(JSON.parse(JSON.stringify(STATIONS)));
  const signalsRef = useRef<Signal[]>(JSON.parse(JSON.stringify(SIGNALS)));
  const particlesRef = useRef<Particle[]>([]);
  const passengersRef = useRef<Passenger[]>([]);
  const textPopupsRef = useRef<{ x: number; y: number; text: string; color: string; timer: number }[]>([]);
  
  // Keep track of keys pressed
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  
  // Animation frames and boarding progress
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const boardingProgressRef = useRef<number>(0);
  const currentStationRef = useRef<Station | null>(null);
  const signalViolationList = useRef<string[]>([]); // To prevent re-triggering signal penalties on the same red duration

  // Stats for the game-over breakdown
  const statsRef = useRef({
    perfectStops: 0,
    excellentStops: 0,
    goodStops: 0,
    signalViolations: 0,
    speedingViolations: 0,
  });

  // Toggle audio
  const handleToggleSound = () => {
    if (!soundEnabled) {
      audio.init();
      audio.resume();
      setSoundEnabled(true);
      triggerStatusMessage("Audio enabled! Press Up = Accelerate, Down = Brake, Space = Horn.");
    } else {
      audio.cleanup();
      setSoundEnabled(false);
    }
  };

  // Status message utility
  const triggerStatusMessage = (msg: string, duration: number = 3) => {
    stateRef.current.statusMessage = msg;
    stateRef.current.statusTimer = duration;
  };

  // Add floating floating text popups
  const addPopup = (text: string, color: string) => {
    // Center of the screen
    textPopupsRef.current.push({
      x: 350, // Around where the train locomotive is drawn
      y: 180,
      text,
      color,
      timer: 1.5 // seconds
    });
  };

  // Keyboard Event Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 's') {
        // Prevent default scrolling for game keys
        e.preventDefault();
      }

      if (!stateRef.current.gameStarted || stateRef.current.gameOver) return;

      if (soundEnabled) {
        audio.init();
        audio.resume();
      }

      keysPressed.current[e.key] = true;

      // Accelerate
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        if (!stateRef.current.emergencyBrakeActive && stateRef.current.passengerStatus === 'idle') {
          stateRef.current.controlState = 'accelerate';
        }
      }

      // Brake
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
        stateRef.current.controlState = 'brake';
      }

      // Horn (Space bar)
      if (e.key === ' ' && !stateRef.current.hornActive) {
        stateRef.current.hornActive = true;
        if (soundEnabled) audio.startHorn();
        
        // Add horn wave particles
        for (let i = 0; i < 5; i++) {
          particlesRef.current.push({
            x: 380,
            y: 205,
            vx: 8 + Math.random() * 3,
            vy: -1 + Math.random() * 2,
            size: 10 + i * 8,
            color: 'rgba(255, 255, 255, 0.4)',
            alpha: 0.5,
            life: 0.4 + i * 0.1,
            maxLife: 0.4 + i * 0.1,
            type: 'bubble'
          });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!stateRef.current.gameStarted || stateRef.current.gameOver) return;

      keysPressed.current[e.key] = false;

      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        // Only switch to coast if they aren't also braking
        if (stateRef.current.controlState === 'accelerate') {
          stateRef.current.controlState = 'coast';
        }
      }

      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
        if (stateRef.current.controlState === 'brake') {
          stateRef.current.controlState = 'coast';
          if (soundEnabled) audio.stopBrakeSqueal();
        }
      }

      if (e.key === ' ') {
        stateRef.current.hornActive = false;
        if (soundEnabled) audio.stopHorn();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [soundEnabled]);

  // Main Loop
  const gameLoop = (timestamp: number) => {
    if (!lastTimeRef.current) {
      lastTimeRef.current = timestamp;
      requestRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const dt = Math.min(0.1, (timestamp - lastTimeRef.current) / 1000); // Caps time-step to 100ms
    lastTimeRef.current = timestamp;

    if (stateRef.current.gameStarted && !stateRef.current.gameOver) {
      updatePhysics(dt);
      updateSignals(dt);
      updateStationsAndPassengers(dt);
      updateParticlesAndPopups(dt);
    }

    renderGame();

    // Throttle React state updates to 8 times per second to maximize performance
    if (Math.random() < 0.15) {
      setGameState({ ...stateRef.current });
      setStations([...stationsRef.current]);
      setSignals([...signalsRef.current]);
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  // Reset Game
  const startNewGame = () => {
    stateRef.current = {
      trainPosition: 0,
      trainSpeed: 0,
      trainAcceleration: 0,
      controlState: 'coast',
      energy: 100,
      score: 0,
      distanceTraveled: 0,
      currentStationId: null,
      passengerStatus: 'idle',
      timeElapsed: 0,
      totalTime: 0,
      gameOver: false,
      gameStarted: true,
      statusMessage: 'Departure Cleared! Use Arrow keys to drive.',
      statusTimer: 5,
      hornActive: false,
      emergencyBrakeActive: false,
      emergencyBrakeTimer: 0,
      passengersDelivered: 0,
    };

    stationsRef.current = JSON.parse(JSON.stringify(STATIONS));
    signalsRef.current = JSON.parse(JSON.stringify(SIGNALS));
    particlesRef.current = [];
    passengersRef.current = [];
    textPopupsRef.current = [];
    signalViolationList.current = [];
    boardingProgressRef.current = 0;
    currentStationRef.current = null;

    statsRef.current = {
      perfectStops: 0,
      excellentStops: 0,
      goodStops: 0,
      signalViolations: 0,
      speedingViolations: 0,
    };

    setShowInstructions(false);
    setGameState({ ...stateRef.current });
    setStations([...stationsRef.current]);
    setSignals([...signalsRef.current]);

    if (soundEnabled) {
      audio.init();
      audio.resume();
    }
  };

  // Update Game Physics
  const updatePhysics = (dt: number) => {
    const s = stateRef.current;
    s.totalTime += dt;

    // Status Message timer
    if (s.statusTimer > 0) {
      s.statusTimer -= dt;
      if (s.statusTimer <= 0) {
        s.statusMessage = '';
      }
    }

    // Handle Speed Limit speeding penalties
    const currentLimit = getCurrentSpeedLimit(s.trainPosition);
    if (s.trainSpeed > currentLimit) {
      // Speeding penalty: -5 score points per second
      if (Math.random() < 0.25) { // Periodic penalty
        s.score = Math.max(0, s.score - 2);
        statsRef.current.speedingViolations += 1;
        triggerStatusMessage(`⚠️ OVER SPEED LIMIT! Max: ${Math.round(currentLimit * 3.6)} km/h`, 1.5);
        if (soundEnabled) audio.playErrorBuzz();
      }
    }

    // Energy management
    if (s.energy <= 0) {
      s.energy = 0;
      if (s.controlState === 'accelerate') {
        s.controlState = 'coast';
        triggerStatusMessage("❌ OUT OF POWER! Let's coast!", 3);
      }
    }

    // Emergency Brake state
    if (s.emergencyBrakeActive) {
      s.emergencyBrakeTimer -= dt;
      s.controlState = 'brake';
      
      // Spawn massive wheel sparks!
      spawnWheelSparks(5);

      if (s.emergencyBrakeTimer <= 0) {
        s.emergencyBrakeActive = false;
        triggerStatusMessage("Emergency brake released.", 2);
      }
    }

    // Choose physics coefficients
    let accPower = 0;
    if (s.controlState === 'accelerate' && s.energy > 0) {
      accPower = 0.40; // m/s^2
      s.energy = Math.max(0, s.energy - 0.35 * dt); // Consumes power
    } else if (s.controlState === 'brake') {
      accPower = s.emergencyBrakeActive ? -3.5 : -1.0; // Rapid braking
      if (s.trainSpeed > 1 && soundEnabled) {
        audio.startBrakeSqueal(s.trainSpeed);
      }
    } else {
      // Coasting
      accPower = -0.05; // Drag friction
      if (soundEnabled) audio.stopBrakeSqueal();
    }

    // Idle energy depletion (very tiny)
    if (s.controlState !== 'accelerate' && s.energy > 0) {
      s.energy = Math.max(0, s.energy - 0.02 * dt);
    }

    // Update Speed
    s.trainSpeed += accPower * dt;
    
    // Lower bound: train cannot reverse
    if (s.trainSpeed < 0.01) {
      s.trainSpeed = 0;
      if (soundEnabled) audio.stopBrakeSqueal();
    }

    // Upper bound: max speed 22 m/s (~80 km/h)
    const maxSpeedCap = 22.22; 
    if (s.trainSpeed > maxSpeedCap) {
      s.trainSpeed = maxSpeedCap;
    }

    // Update Position
    s.trainPosition += s.trainSpeed * dt;
    s.distanceTraveled = s.trainPosition;

    // Check game success (past final station by 150m)
    const lastStation = stationsRef.current[stationsRef.current.length - 1];
    if (s.trainPosition >= lastStation.position + 150) {
      s.gameOver = true;
      triggerStatusMessage("🎉 ROUTE COMPLETED! VICTORY!", 10);
      s.score += Math.round(s.energy * 5); // Energy efficiency bonus!
      if (soundEnabled) audio.playSuccessChime();
    }

    // Check game over - stopped with 0 energy and not at a station
    if (s.energy <= 0 && s.trainSpeed === 0 && s.passengerStatus === 'idle') {
      // Check if inside any station platform
      let nearStation = false;
      for (const st of stationsRef.current) {
        const dist = Math.abs(s.trainPosition - st.position);
        if (dist <= st.platformLength / 2) {
          nearStation = true;
          break;
        }
      }
      if (!nearStation) {
        s.gameOver = true;
        s.statusMessage = "Game Over - Run out of power short of a station!";
        if (soundEnabled) audio.playErrorBuzz();
      }
    }

    // Update Engine audio hum
    if (soundEnabled) {
      audio.updateEngineSound(s.trainSpeed, s.controlState === 'accelerate');
    }

    // Spawn pantograph electric spark particles randomly when accelerating
    if (s.controlState === 'accelerate' && s.trainSpeed > 0 && Math.random() < 0.12) {
      // Pantograph is high up near the wire
      const sparkX = 330; // approx pantograph location
      const sparkY = 105; // wire height
      for (let i = 0; i < 3; i++) {
        particlesRef.current.push({
          x: sparkX,
          y: sparkY,
          vx: -3 - Math.random() * 4,
          vy: -2 + Math.random() * 4,
          size: 2 + Math.random() * 3,
          color: ['#4ade80', '#60a5fa', '#a7f3d0', '#ffffff'][Math.floor(Math.random() * 4)],
          alpha: 1.0,
          life: 0.3 + Math.random() * 0.3,
          maxLife: 0.6,
          type: 'spark'
        });
      }
    }
  };

  const spawnWheelSparks = (count: number) => {
    // Wheels are low at tracks
    const wheelY = 245;
    const wheelXs = [120, 160, 240, 280, 340, 380]; // locations of train bogies
    wheelXs.forEach(wx => {
      if (Math.random() < 0.6) {
        for (let i = 0; i < count; i++) {
          particlesRef.current.push({
            x: wx,
            y: wheelY + Math.random() * 4,
            vx: -5 - Math.random() * 5,
            vy: -1 - Math.random() * 2,
            size: 1.5 + Math.random() * 2,
            color: '#f97316', // bright orange sparks
            alpha: 1.0,
            life: 0.2 + Math.random() * 0.3,
            maxLife: 0.5,
            type: 'spark'
          });
        }
      }
    });
  };

  // Get current speed limit
  const getCurrentSpeedLimit = (pos: number) => {
    for (const zone of SPEED_LIMIT_ZONES) {
      if (pos >= zone.start && pos <= zone.end) {
        return zone.limit;
      }
    }
    return DEFAULT_SPEED_LIMIT;
  };

  // Signals Logic
  const updateSignals = (dt: number) => {
    const s = stateRef.current;
    
    signalsRef.current.forEach(sig => {
      // Cycle timer
      sig.timer -= dt;
      if (sig.timer <= 0) {
        sig.state = sig.state === 'GREEN' ? 'RED' : 'GREEN';
        sig.timer = sig.state === 'GREEN' ? sig.durationGreen : sig.durationRed;
        
        // Remove signal from violation cache once it turns green
        if (sig.state === 'GREEN') {
          signalViolationList.current = signalViolationList.current.filter(id => id !== sig.id);
        }
      }

      // Check for Red Signal Violation
      // Front of train crosses the signal position (drawn at fixed center 380px, track is at trainPosition)
      // Signal crossed when trainPosition (center of train) gets past the signal
      // Actually let's calculate relative to front of the train (which is trainPosition + locomotiveFrontOffset)
      // Locomotive front is 10m ahead of train center (trainPosition)
      const locomotiveFront = s.trainPosition + 12; 

      if (sig.state === 'RED' && locomotiveFront >= sig.position && (locomotiveFront - s.trainSpeed * dt) < sig.position) {
        if (!signalViolationList.current.includes(sig.id)) {
          signalViolationList.current.push(sig.id);
          
          // CRASH/BRAKE PENALTY
          s.emergencyBrakeActive = true;
          s.emergencyBrakeTimer = 3.5; // 3.5 seconds forced brake
          s.score = Math.max(0, s.score - 150);
          statsRef.current.signalViolations += 1;
          
          triggerStatusMessage("❌ RED SIGNAL VIOLATION! EMERGENCY BRAKE ENGAGED (-150 pts)", 3.5);
          addPopup("RED VIOLATION! -150", "#ef4444");
          if (soundEnabled) {
            audio.playErrorBuzz();
            audio.playEmergencyHiss();
          }
        }
      }
    });
  };

  // Stations & Passenger Boarding Logic
  const updateStationsAndPassengers = (dt: number) => {
    const s = stateRef.current;

    // Detect if train is stationary near an unvisited station
    if (s.trainSpeed === 0 && s.passengerStatus === 'idle') {
      const unvisited = stationsRef.current.find(st => !st.hasVisited);
      if (unvisited) {
        const stopDistance = Math.abs(s.trainPosition - unvisited.position);
        
        // Train is stopped inside the platform length boundary
        if (stopDistance <= unvisited.platformLength / 2) {
          // Trigger boarding!
          s.passengerStatus = 'boarding';
          s.currentStationId = unvisited.id;
          currentStationRef.current = unvisited;
          boardingProgressRef.current = 0;
          
          triggerStatusMessage(`Stopping at ${unvisited.name}... Opening doors.`, 3);
          if (soundEnabled) {
            audio.playSuccessChime();
            setTimeout(() => {
              if (stateRef.current.passengerStatus === 'boarding') {
                audio.playDoorChime();
              }
            }, 600);
          }

          // Create passenger objects walking on screen!
          // We spawn waiting passengers on the platform walking to the train door
          // And disembarking passengers leaving the train
          const passengerCount = unvisited.passengerCount;
          const doorX = 300; // train door location
          
          passengersRef.current = [];
          
          // Boarding passengers
          for (let i = 0; i < passengerCount; i++) {
            passengersRef.current.push({
              id: `p_in_${i}`,
              x: doorX + 150 + Math.random() * 250, // spread on platform
              y: 228,
              targetX: doorX - 10 + Math.random() * 20, // train doors
              state: 'waiting',
              color: ['#fb923c', '#38bdf8', '#4ade80', '#f472b6', '#a78bfa'][Math.floor(Math.random() * 5)],
              bounceOffset: Math.random() * Math.PI,
            });
          }

          // Disembarking passengers (carrying from previous runs, say 5-15)
          const disembarkCount = Math.floor(Math.random() * 10) + 5;
          for (let i = 0; i < disembarkCount; i++) {
            passengersRef.current.push({
              id: `p_out_${i}`,
              x: doorX - 10 + Math.random() * 20, // exiting doors
              y: 228,
              targetX: doorX - 120 - Math.random() * 200, // walk away
              state: 'disembarking',
              color: ['#fb923c', '#38bdf8', '#4ade80', '#f472b6', '#a78bfa'][Math.floor(Math.random() * 5)],
              bounceOffset: Math.random() * Math.PI,
            });
          }
        }
      }
    }

    // Handle Active Boarding Progress
    if (s.passengerStatus === 'boarding' && currentStationRef.current) {
      const st = currentStationRef.current;
      
      // Boarding speed
      boardingProgressRef.current = Math.min(100, boardingProgressRef.current + 20 * dt);
      s.energy = Math.min(100, s.energy + 15 * dt); // Refuels at station

      // Update passenger walking animations
      passengersRef.current.forEach(p => {
        const walkSpeed = 65 * dt;
        if (p.state === 'waiting') {
          if (p.x > p.targetX) {
            p.x -= walkSpeed;
            if (p.x <= p.targetX) {
              p.state = 'boarding';
            }
          }
        } else if (p.state === 'disembarking') {
          if (p.x > p.targetX) {
            p.x -= walkSpeed;
          } else {
            p.state = 'gone';
          }
        }
      });

      if (boardingProgressRef.current >= 100) {
        // Boarding completed!
        s.passengerStatus = 'idle';
        st.hasVisited = true;
        s.currentStationId = null;

        // Calculate score bonus based on stop distance to center
        const stopDistance = Math.abs(s.trainPosition - st.position);
        let stopRating = '';
        let points = 0;
        let ratingColor = '';

        if (stopDistance <= 2.5) {
          stopRating = 'PERFECT STOP!';
          points = 300;
          ratingColor = '#4ade80'; // Emerald green
          statsRef.current.perfectStops += 1;
        } else if (stopDistance <= 9.0) {
          stopRating = 'EXCELLENT STOP!';
          points = 180;
          ratingColor = '#60a5fa'; // Blue
          statsRef.current.excellentStops += 1;
        } else if (stopDistance <= 20.0) {
          stopRating = 'GOOD STOP';
          points = 90;
          ratingColor = '#eab308'; // Yellow
          statsRef.current.goodStops += 1;
        } else {
          stopRating = 'STOPPED';
          points = 45;
          ratingColor = '#94a3b8'; // Grey
        }

        // Speed arrival bonus (on-time bonus)
        // Expected average speed 12m/s, so we compute target duration
        const targetDuration = st.position / 12 + 20; // some leeway
        let timeBonus = 0;
        if (s.totalTime < targetDuration) {
          timeBonus = Math.round((targetDuration - s.totalTime) * 3);
          points += timeBonus;
        }

        s.score += points;
        s.passengersDelivered += st.passengerCount;
        
        triggerStatusMessage(`✅ ${stopRating} (+${points} pts)! Boarding complete.`, 4.5);
        addPopup(`${stopRating} +${points}`, ratingColor);
        if (soundEnabled) {
          audio.playScoreUp();
          audio.playDoorChime();
        }

        currentStationRef.current = null;
        passengersRef.current = [];
      }
    }
  };

  // Particles & Popups update
  const updateParticlesAndPopups = (dt: number) => {
    // Update Particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.life -= dt;
      p.x += p.vx * (60 * dt);
      p.y += p.vy * (60 * dt);
      p.alpha = Math.max(0, p.life / p.maxLife);

      if (p.type === 'smoke') {
        p.vx *= 0.98;
        p.vy -= 0.1 * dt; // drifts up
        p.size += 0.4 * (60 * dt);
      } else if (p.type === 'spark') {
        p.vy += 0.12 * (60 * dt); // gravity
      } else if (p.type === 'bubble') {
        p.vx *= 0.95;
        p.size += 0.8 * (60 * dt);
      }

      return p.life > 0;
    });

    // Update Text Popups
    textPopupsRef.current = textPopupsRef.current.filter(pop => {
      pop.timer -= dt;
      pop.y -= 1.2 * (60 * dt); // Rise up
      return pop.timer > 0;
    });
  };

  // Draw Game Environment on HTML5 Canvas
  const renderGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const s = stateRef.current;

    // Clear Canvas
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Sky (Gradient morning theme)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, '#0f172a'); // Very deep slate blue at top
    skyGrad.addColorStop(0.5, '#1e293b'); // Medium slate blue
    skyGrad.addColorStop(0.85, '#334155'); // Soft twilight grey
    skyGrad.addColorStop(1, '#1e293b'); // Bottom horizon
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // Dynamic environmental elements offset (using train position)
    const pos = s.trainPosition;

    // 2. Draw Stars/Twinkles (Cosmic Slate detail)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (let i = 0; i < 15; i++) {
      const starX = (300 + i * 180 - pos * 0.01) % width;
      const starY = (40 + (i * 27) % 110);
      const size = 1 + (Math.sin(pos * 0.05 + i) * 0.6);
      ctx.fillRect(starX < 0 ? starX + width : starX, starY, size, size);
    }

    // 3. Draw Background mountains (Parallax layer 1: factor -0.04)
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 40) {
      const mX = x + pos * 0.04;
      const mY = height - 160 - Math.sin(mX * 0.003) * 60 - Math.cos(mX * 0.007) * 20;
      if (x === 0) ctx.moveTo(x, mY);
      else ctx.lineTo(x, mY);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // 4. Draw Distant hills (Parallax layer 2: factor -0.15)
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 30) {
      const mX = x + pos * 0.15;
      const mY = height - 120 - Math.cos(mX * 0.005) * 35 - Math.sin(mX * 0.01) * 10;
      if (x === 0) ctx.moveTo(x, mY);
      else ctx.lineTo(x, mY);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // 5. Draw Silhouetted Pine Trees (Parallax layer 3: factor -0.4)
    ctx.fillStyle = '#0a0f1d';
    const treeSpacing = 160;
    const treeOffset = (pos * 0.4) % treeSpacing;
    for (let i = -1; i < (width / treeSpacing) + 2; i++) {
      const tx = i * treeSpacing - treeOffset;
      // Draw tree silhouette
      ctx.beginPath();
      ctx.moveTo(tx, height - 80);
      ctx.lineTo(tx - 25, height - 40);
      ctx.lineTo(tx - 15, height - 40);
      ctx.lineTo(tx - 30, height);
      ctx.lineTo(tx + 30, height);
      ctx.lineTo(tx + 15, height - 40);
      ctx.lineTo(tx + 25, height - 40);
      ctx.closePath();
      ctx.fill();
    }

    // 6. Draw speed limit and construction signs ahead (Direct track coordinate space)
    // Draw Speed Limit Zones
    SPEED_LIMIT_ZONES.forEach(zone => {
      // Draw start sign
      const signX = 350 + (zone.start - pos) * PIXELS_PER_METER;
      if (signX > -100 && signX < width + 100) {
        drawSpeedLimitSign(ctx, signX, height - 85, zone.limit);
      }
      // Draw end sign
      const endX = 350 + (zone.end - pos) * PIXELS_PER_METER;
      if (endX > -100 && endX < width + 100) {
        drawSpeedLimitSign(ctx, endX, height - 85, DEFAULT_SPEED_LIMIT, true);
      }
    });

    // 7. Draw Catenary poles (Overhead electric wires)
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 1.5;
    const poleSpacing = 240;
    const poleOffset = (pos * PIXELS_PER_METER) % poleSpacing;
    
    // Wire drawing
    ctx.beginPath();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    // Overhead cable catenary curve
    for (let x = -20; x < width + 40; x += 10) {
      // simulate wire sag
      const localX = (x + pos * PIXELS_PER_METER) % poleSpacing;
      const sag = Math.sin((localX / poleSpacing) * Math.PI) * 5;
      const wireY = 105 + sag;
      if (x === -20) ctx.moveTo(x, wireY);
      else ctx.lineTo(x, wireY);
    }
    ctx.stroke();

    // Poles
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    for (let i = -1; i < (width / poleSpacing) + 2; i++) {
      const px = i * poleSpacing - poleOffset;
      ctx.beginPath();
      ctx.moveTo(px, height - 40);
      ctx.lineTo(px, 100); // Vertical mast
      ctx.lineTo(px - 15, 105); // Cantilever bracket arm
      ctx.stroke();
    }

    // 8. Draw Station Platforms
    stationsRef.current.forEach(st => {
      const stX = 350 + (st.position - pos) * PIXELS_PER_METER;
      const halfWidth = (st.platformLength / 2) * PIXELS_PER_METER;
      
      if (stX + halfWidth > -200 && stX - halfWidth < width + 200) {
        // Draw platform background concrete structure
        ctx.fillStyle = '#1e293b'; // slate platform body
        ctx.fillRect(stX - halfWidth, height - 60, halfWidth * 2, 24);
        
        // Yellow safety warning strip
        ctx.fillStyle = '#eab308';
        ctx.fillRect(stX - halfWidth, height - 60, halfWidth * 2, 3);
        ctx.fillStyle = '#0f172a';
        // Dash pattern on yellow strip
        for (let dx = stX - halfWidth; dx < stX + halfWidth; dx += 12) {
          ctx.fillRect(dx, height - 60, 6, 3);
        }

        // Platform poles and roof cover
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 4;
        const poleCount = 4;
        for (let j = 0; j < poleCount; j++) {
          const px = stX - halfWidth + (st.platformLength * PIXELS_PER_METER * (j / (poleCount - 1)));
          ctx.beginPath();
          ctx.moveTo(px, height - 60);
          ctx.lineTo(px, height - 130);
          ctx.stroke();

          // Canopy support beams
          ctx.beginPath();
          ctx.moveTo(px - 15, height - 130);
          ctx.lineTo(px + 15, height - 130);
          ctx.stroke();
        }

        // Canopy roof
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(stX - halfWidth - 20, height - 136, halfWidth * 2 + 40, 8);

        // Station Banner/Signboard
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.fillRect(stX - 60, height - 110, 120, 24);
        ctx.strokeRect(stX - 60, height - 110, 120, 24);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px "Space Grotesk"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(st.name, stX, height - 98);

        // Platform target stop line
        ctx.strokeStyle = '#4ade80'; // Neon green
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(stX, height - 130);
        ctx.lineTo(stX, height - 36);
        ctx.stroke();

        // Banner for Target Stop
        ctx.fillStyle = 'rgba(74, 222, 128, 0.15)';
        ctx.fillRect(stX - 35, height - 90, 70, 14);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(stX - 35, height - 90, 70, 14);
        ctx.fillStyle = '#4ade80';
        ctx.font = '8px "Space Grotesk"';
        ctx.fillText("STOP TARGET", stX, height - 83);

        // Platform lights glowing
        ctx.fillStyle = 'rgba(253, 224, 71, 0.2)';
        ctx.beginPath();
        for (let j = 0; j < poleCount; j++) {
          const px = stX - halfWidth + (st.platformLength * PIXELS_PER_METER * (j / (poleCount - 1)));
          ctx.arc(px, height - 130, 15, 0, Math.PI, true);
        }
        ctx.fill();
      }
    });

    // 9. Draw Signals along the track
    signalsRef.current.forEach(sig => {
      const sigX = 350 + (sig.position - pos) * PIXELS_PER_METER;
      if (sigX > -50 && sigX < width + 50) {
        // Draw vertical pole
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sigX, height - 36);
        ctx.lineTo(sigX, height - 140);
        ctx.stroke();

        // Draw signal box
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.fillRect(sigX - 8, height - 145, 16, 28);
        ctx.strokeRect(sigX - 8, height - 145, 16, 28);

        // Draw Red lens
        ctx.fillStyle = sig.state === 'RED' ? '#ef4444' : '#3f0712'; // bright red vs dark red
        ctx.beginPath();
        ctx.arc(sigX, height - 137, 4, 0, Math.PI * 2);
        ctx.fill();

        // Draw Green lens
        ctx.fillStyle = sig.state === 'GREEN' ? '#22c55e' : '#052e16'; // bright green vs dark green
        ctx.beginPath();
        ctx.arc(sigX, height - 125, 4, 0, Math.PI * 2);
        ctx.fill();

        // Red/Green Lens Glow effects
        if (sig.state === 'RED') {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.beginPath();
          ctx.arc(sigX, height - 137, 12, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
          ctx.beginPath();
          ctx.arc(sigX, height - 125, 12, 0, Math.PI * 2);
          ctx.fill();
        }

        // Speed Limit Banner next to signal
        ctx.fillStyle = '#334155';
        ctx.font = '9px "JetBrains Mono"';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(sig.timer)}s`, sigX + 12, height - 130);
      }
    });

    // 10. Draw Passengers walking on the platform (if stopped at station)
    if (s.passengerStatus === 'boarding' && passengersRef.current.length > 0) {
      passengersRef.current.forEach(p => {
        if (p.state === 'gone') return;
        
        // Passengers bounce as they walk
        const bounce = Math.sin(pos * 0.15 + p.bounceOffset) * 4;
        
        ctx.fillStyle = p.color;
        ctx.beginPath();
        // Head
        ctx.arc(p.x, p.y - 12 + bounce, 4, 0, Math.PI * 2);
        ctx.fill();
        // Body
        ctx.fillRect(p.x - 3, p.y - 8 + bounce, 6, 8);
      });
    }

    // 11. Draw Train Rails and Ties (Direct bottom track)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, height - 36, width, 14);

    // Ballast track ground
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, height - 33, width, 6);

    // Track Ties (wooden slats)
    ctx.fillStyle = '#451a03'; // brown ties
    const tieSpacing = 16;
    const tieOffset = (pos * PIXELS_PER_METER) % tieSpacing;
    for (let x = -tieSpacing; x < width + tieSpacing; x += tieSpacing) {
      ctx.fillRect(x - tieOffset, height - 30, 4, 3);
    }

    // Steel Rails (two parallel gray lines)
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, height - 28, width, 2);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, height - 27, width, 1);

    // 12. DRAW THE TRAIN!
    // Drawn relative to fixed screen offset around X_CENTER (say, 350px)
    const trainX = 350;
    const trainY = height - 26; // standing on track

    // Train is a modern electrical bullet locomotive + 2 coaches linked behind it
    // Moving backwards, coaches are to the left (behind train direction, since we drive rightwards)
    // Front locomotive coordinates: (trainX, trainY)
    // Coach 1: (trainX - 220, trainY)
    // Coach 2: (trainX - 440, trainY)

    // Wheel rotation angle based on train position
    const wheelRadius = 10;
    const wheelAngle = (pos * PIXELS_PER_METER) / wheelRadius;

    // --- COACH 2 (The rear coach) ---
    drawPassengerCoach(ctx, trainX - 440, trainY, wheelAngle, wheelRadius);

    // Gangway connection bellows 1-2
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(trainX - 250, trainY - 45, 12, 38);

    // --- COACH 1 (The middle coach) ---
    drawPassengerCoach(ctx, trainX - 238, trainY, wheelAngle, wheelRadius);

    // Gangway connection bellows 2-Engine
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(trainX - 48, trainY - 45, 12, 38);

    // --- LOCOMOTIVE ENGINE (Front cabin) ---
    drawLocomotive(ctx, trainX - 36, trainY, wheelAngle, wheelRadius, s.controlState === 'accelerate', s.trainSpeed);

    // 13. Draw Text Popups (Score indicators)
    textPopupsRef.current.forEach(pop => {
      ctx.fillStyle = pop.color;
      ctx.font = 'bold 12px "Space Grotesk"';
      ctx.textAlign = 'center';
      ctx.fillText(pop.text, pop.x, pop.y);
    });

    // 14. Draw Particles (Sparks, bubbles, track smoke)
    particlesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0; // Reset

    // 15. Warnings & Alerts Overlay on Canvas Top Center
    let alertActive = false;
    let alertMessage = '';
    let alertSub = '';

    // Next red signal alert
    const upcomingSignal = signalsRef.current.find(sig => sig.position > s.trainPosition && sig.position < s.trainPosition + 250);
    if (upcomingSignal && upcomingSignal.state === 'RED') {
      alertActive = true;
      alertMessage = `🚨 RED SIGNAL AHEAD: ${Math.round(upcomingSignal.position - s.trainPosition)}m!`;
      alertSub = `Slow down and prepare to STOP! Time remaining: ${Math.round(upcomingSignal.timer)}s`;
    }

    // Over speed limit alert
    const activeLimit = getCurrentSpeedLimit(s.trainPosition);
    if (s.trainSpeed > activeLimit) {
      alertActive = true;
      alertMessage = `⚠️ OVERSPEED PENALTY!`;
      alertSub = `Current Speed: ${Math.round(s.trainSpeed * 3.6)} km/h | Limit: ${Math.round(activeLimit * 3.6)} km/h`;
    }

    // Fuel critical alert
    if (s.energy < 15 && s.energy > 0) {
      alertActive = true;
      alertMessage = `⚡ CRITICAL ENERGY WARNING!`;
      alertSub = `Energy at ${Math.round(s.energy)}% - Pull into next station to recharge!`;
    }

    if (alertActive) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.fillRect(width / 2 - 180, 15, 360, 48);
      ctx.strokeRect(width / 2 - 180, 15, 360, 48);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px "Space Grotesk"';
      ctx.textAlign = 'center';
      ctx.fillText(alertMessage, width / 2, 32);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px "JetBrains Mono"';
      ctx.fillText(alertSub, width / 2, 48);
    }

    // Next Station Indicator inside the canvas (Top Right)
    const nextStation = stationsRef.current.find(st => !st.hasVisited);
    if (nextStation) {
      const distToStation = nextStation.position - s.trainPosition;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(width - 190, 15, 175, 45);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(width - 190, 15, 175, 45);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px "Space Grotesk"';
      ctx.textAlign = 'left';
      ctx.fillText("NEXT STATION", width - 180, 28);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "Space Grotesk"';
      ctx.fillText(nextStation.name, width - 180, 40);

      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 11px "JetBrains Mono"';
      ctx.fillText(`${Math.round(distToStation)}m`, width - 180, 52);
    }
  };

  const drawSpeedLimitSign = (ctx: CanvasRenderingContext2D, x: number, y: number, limit: number, isEnd = false) => {
    // Post
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 49);
    ctx.stroke();

    // Circle Sign
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = isEnd ? '#475569' : '#ef4444';
    ctx.lineWidth = isEnd ? 2 : 3;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isEnd) {
      // Draw end diagonal gray stripes
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 10, y + 10);
      ctx.lineTo(x + 10, y - 10);
      ctx.stroke();
    }

    // Value text
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(limit * 3.6).toString(), x, y);
  };

  const drawPassengerCoach = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    radius: number
  ) => {
    const w = 200; // Coach width
    const h = 42;  // Coach height
    const cy = y - h - 4;

    // Body metal - Luxury metallic gradient
    const bodyGrad = ctx.createLinearGradient(x, cy, x, cy + h);
    bodyGrad.addColorStop(0, '#475569'); // Light metallic highlight
    bodyGrad.addColorStop(0.25, '#334155'); // Deep slate
    bodyGrad.addColorStop(0.75, '#1e293b'); // Dark chassis color
    bodyGrad.addColorStop(1, '#0f172a'); // Bottom shadow
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(x, cy, w, h);

    // Sleek chrome border / panel lines
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, cy, w, h);

    // Decorative stripes
    ctx.fillStyle = '#64748b';
    ctx.fillRect(x, cy + h - 8, w, 4);
    
    // Glowing electric cyan racing line
    ctx.fillStyle = '#22d3ee'; // Electric cyan neon stripe
    ctx.fillRect(x, cy + h - 4, w, 2);

    // Sleek plug doors with round windows and indicator lights
    const drawDoor = (dx: number) => {
      // Door pocket background
      ctx.fillStyle = '#111827';
      ctx.fillRect(dx, cy + 2, 16, h - 2);

      // Door leaves
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(dx + 1, cy + 2, 6.5, h - 3);
      ctx.fillRect(dx + 8.5, cy + 2, 6.5, h - 3);

      // Glass ports
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(dx + 2, cy + 8, 4.5, 10);
      ctx.fillRect(dx + 9.5, cy + 8, 4.5, 10);

      // Warning/indicator LED above door (green = open, red = closed)
      const isBoarding = stateRef.current.passengerStatus === 'boarding';
      ctx.fillStyle = isBoarding ? '#22c55e' : '#ef4444';
      ctx.beginPath();
      ctx.arc(dx + 8, cy - 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    };

    drawDoor(x + 12);      // Left door
    drawDoor(x + w - 28);  // Right door

    // High-tech Orange LED destination board (Digital Matrix)
    ctx.fillStyle = '#020617';
    ctx.fillRect(x + w / 2 - 25, cy + 3, 50, 6);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x + w / 2 - 25, cy + 3, 50, 6);

    ctx.fillStyle = '#f97316'; // Glowing LED Amber
    ctx.font = 'bold 5px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("EXPRESS 808", x + w / 2, cy + 6.5);

    // Windows with warm luxury interior lighting and varied passenger silhouettes
    const winWidth = 20;
    const winHeight = 14;
    const winCount = 5;
    for (let i = 0; i < winCount; i++) {
      const winX = x + 40 + i * 25;
      
      // Rounded window corners
      ctx.fillStyle = '#0f172a'; // Window frame outer
      ctx.fillRect(winX - 1, cy + 7, winWidth + 2, winHeight + 2);

      const winGrad = ctx.createLinearGradient(winX, cy + 8, winX, cy + 8 + winHeight);
      winGrad.addColorStop(0, '#fef08a'); // Bright amber/warm lighting
      winGrad.addColorStop(1, '#facc15'); // Rich golden sunset interior glow
      ctx.fillStyle = winGrad;
      ctx.fillRect(winX, cy + 8, winWidth, winHeight);

      // Passenger silhouettes with different heights/shapes for variety
      if ((i * 3 + 2) % 2 === 0) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.beginPath();
        // Head
        const headOffset = (i % 2 === 0) ? 8 : 12;
        ctx.arc(winX + headOffset, cy + 15, 3.5, 0, Math.PI * 2);
        ctx.fill();
        // Shoulders
        ctx.beginPath();
        ctx.ellipse(winX + headOffset, cy + 21, 6, 4, 0, 0, Math.PI, true);
        ctx.fill();
      }
    }

    // Undercarriage components - complex machinery details
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + 35, y - 4, w - 70, 4); // chassis belly box
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + w / 2 - 20, y - 3, 40, 3); // battery module
    
    // Wheels bogies
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 18, y - 7, 44, 3);
    ctx.fillRect(x + w - 62, y - 7, 44, 3);

    // Brake shoes detail
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + 15, y - 5, 4, 4);
    ctx.fillRect(x + 61, y - 5, 4, 4);
    ctx.fillRect(x + w - 65, y - 5, 4, 4);
    ctx.fillRect(x + w - 19, y - 5, 4, 4);

    // Wheel hubs
    drawWheel(ctx, x + 25, y - 5, angle, radius);
    drawWheel(ctx, x + 55, y - 5, angle, radius);
    drawWheel(ctx, x + w - 55, y - 5, angle, radius);
    drawWheel(ctx, x + w - 25, y - 5, angle, radius);
  };

  const drawLocomotive = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    radius: number,
    accelerating: boolean,
    speed: number
  ) => {
    const w = 210;
    const h = 46;
    const cy = y - h - 4;

    // Aerodynamic futuristic white bullet-train nose gradient
    const noseGrad = ctx.createLinearGradient(x, cy, x, cy + h);
    noseGrad.addColorStop(0, '#ffffff');  // Pure gloss highlight
    noseGrad.addColorStop(0.35, '#f8fafc'); // Soft silver
    noseGrad.addColorStop(0.75, '#cbd5e1'); // Matte gray depth
    noseGrad.addColorStop(1, '#94a3b8');   // Shadow line
    
    ctx.fillStyle = noseGrad;
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + w - 45, cy);
    ctx.quadraticCurveTo(x + w - 5, cy + 10, x + w, cy + h); // sleek bullet curve
    ctx.lineTo(x, cy + h);
    ctx.closePath();
    ctx.fill();

    // Bottom dark carbon-fiber aerodynamic chassis skirting
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, cy + h - 6, w - 12, 6);

    // Sleek neon Orange racing stripe wrapping around the nose
    ctx.fillStyle = '#f97316'; // Vivid orange
    ctx.beginPath();
    ctx.moveTo(x + 20, cy + 24);
    ctx.lineTo(x + w - 40, cy + 24);
    ctx.quadraticCurveTo(x + w - 10, cy + 28, x + w - 3, cy + h - 6);
    ctx.lineTo(x + w - 12, cy + h - 6);
    ctx.lineTo(x + 10, cy + h - 6);
    ctx.closePath();
    ctx.fill();

    // High-tech side cooling grill vents
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 40, cy + 10, 30, 8);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    for (let gi = 0; gi < 5; gi++) {
      ctx.beginPath();
      ctx.moveTo(x + 43 + gi * 5, cy + 10);
      ctx.lineTo(x + 43 + gi * 5, cy + 18);
      ctx.stroke();
    }

    // Panoramic Windshield (Futuristic Wrap-Around cockpit)
    const glassGrad = ctx.createLinearGradient(x + w - 60, cy + 6, x + w - 25, cy + 18);
    glassGrad.addColorStop(0, '#0f172a');
    glassGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.moveTo(x + w - 65, cy + 6);
    ctx.lineTo(x + w - 36, cy + 6);
    ctx.lineTo(x + w - 20, cy + 20);
    ctx.lineTo(x + w - 50, cy + 20);
    ctx.closePath();
    ctx.fill();

    // Windshield reflections (white gloss edge)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w - 63, cy + 8);
    ctx.lineTo(x + w - 38, cy + 8);
    ctx.lineTo(x + w - 25, cy + 19);
    ctx.stroke();

    // Conductor Silhouette at the control dashboard
    ctx.fillStyle = '#38bdf8'; // Glowing blue dashboard glow reflection on conductor
    ctx.beginPath();
    ctx.arc(x + w - 44, cy + 13, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x + w - 44, cy + 19, 4, 3, 0, 0, Math.PI, true);
    ctx.fill();

    // Bright Triple-Headlight system (1 nose light + 2 ditch lights)
    // 1. Nose headlight
    const headX = x + w - 4;
    const headY = cy + 29;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(headX, headY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Headlight lens flare concentric rings
    ctx.fillStyle = 'rgba(254, 240, 138, 0.4)';
    ctx.beginPath();
    ctx.arc(headX, headY, 6, 0, Math.PI * 2);
    ctx.fill();

    // 2. Twin lower ground headlights (ditch lights)
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(x + w - 14, cy + h - 10, 2, 0, Math.PI * 2);
    ctx.arc(x + w - 24, cy + h - 11, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Spectacular Headlight Cone light beam
    const coneGrad = ctx.createLinearGradient(headX, headY, headX + 220, headY);
    coneGrad.addColorStop(0, 'rgba(254, 240, 138, 0.6)');
    coneGrad.addColorStop(0.3, 'rgba(254, 240, 138, 0.25)');
    coneGrad.addColorStop(1, 'rgba(254, 240, 138, 0.0)');
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(headX, headY);
    ctx.lineTo(headX + 220, headY - 45);
    ctx.lineTo(headX + 220, headY + 45);
    ctx.closePath();
    ctx.fill();

    // High-Voltage Overhead Pantograph Assembly
    const basePX = x + 60;
    const basePY = cy;
    
    // Insulator blocks on roof (orange-red ceramic discs)
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(basePX - 12, basePY - 2, 24, 2);
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(basePX - 8, basePY - 4, 4, 2);
    ctx.fillRect(basePX + 4, basePY - 4, 4, 2);

    // Pantograph tension arms (detailed mechanical structure)
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(basePX, basePY - 4);
    // Lower arm
    const midX = basePX + 15;
    const midY = basePY - 18;
    ctx.lineTo(midX, midY);
    // Upper arm up to catenary contact bar (y = 105)
    ctx.lineTo(basePX - 4, 105);
    ctx.stroke();

    // Contact carbon head plate (slider shoe)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(basePX - 14, 103, 20, 3);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(basePX - 10, 102, 12, 1);

    // Dynamic blue spark discharge at the pantograph shoe when accelerating
    if (accelerating && speed > 0 && Math.random() < 0.45) {
      // Glow circle
      ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.beginPath();
      ctx.arc(basePX - 4, 105, 12, 0, Math.PI * 2);
      ctx.fill();

      // Sharp spark core
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(basePX - 4, 105);
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        ctx.lineTo(basePX - 4 + (Math.random() * 16 - 8), 105 + (Math.random() * 12 - 6));
      }
      ctx.stroke();
    }

    // Wheels bogies
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 20, y - 7, 44, 3);
    ctx.fillRect(x + w - 75, y - 7, 44, 3);

    // Wheels
    drawWheel(ctx, x + 28, y - 5, angle, radius);
    drawWheel(ctx, x + 58, y - 5, angle, radius);
    drawWheel(ctx, x + w - 68, y - 5, angle, radius);
    drawWheel(ctx, x + w - 38, y - 5, angle, radius);
  };

  const drawWheel = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    radius: number
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Rim
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Steel tire edge
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius - 1, 0, Math.PI * 2);
    ctx.stroke();

    // Spokes
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-radius + 2, 0);
      ctx.lineTo(radius - 2, 0);
      ctx.stroke();
      ctx.rotate(Math.PI / 4);
    }

    // Axle cap
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // Canvas Resize Listener
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.parentElement?.clientWidth || 1000;
      canvas.height = 320; // Fixed canvas height
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Start gameloop
    requestRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [soundEnabled]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans select-none overflow-x-hidden">
      {/* HEADER SECTION */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500 text-slate-950 rounded-lg shadow-inner">
            <Gauge size={22} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">2D Train Simulator</h1>
            <p className="text-xs text-slate-400">Accurate stopping & signal compliance trainer</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowInstructions(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition"
          >
            <Info size={14} />
            How to Play
          </button>

          <button
            onClick={handleToggleSound}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition ${
              soundEnabled 
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30 hover:bg-amber-500/20' 
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
            }`}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {soundEnabled ? 'SOUND ON' : 'SOUND MUTED'}
          </button>
        </div>
      </header>

      {/* VIEWPORT / STAGE AREA */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4 max-w-7xl mx-auto w-full">
        
        {/* TOP STATUS BAR */}
        <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 text-center bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/80 backdrop-blur-sm">
          <div className="flex flex-col py-1.5 border-r border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono tracking-wider">TRAIN STATUS</span>
            <span className={`text-xs font-bold font-mono tracking-wide ${
              gameState.emergencyBrakeActive 
                ? 'text-red-500 animate-pulse' 
                : gameState.passengerStatus !== 'idle' 
                ? 'text-green-400' 
                : 'text-amber-400'
            }`}>
              {gameState.emergencyBrakeActive 
                ? 'EMERGENCY BRAKING' 
                : gameState.passengerStatus === 'boarding' 
                ? 'BOARDING PASSENGERS' 
                : gameState.trainSpeed > 0 
                ? 'CRUISING' 
                : 'STATIONARY'}
            </span>
          </div>

          <div className="flex flex-col py-1.5 border-r border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono tracking-wider">SPEED LIMIT</span>
            <span className={`text-xs font-bold font-mono ${gameState.trainSpeed > getCurrentSpeedLimit(gameState.trainPosition) ? 'text-red-500 animate-bounce' : 'text-slate-300'}`}>
              {Math.round(getCurrentSpeedLimit(gameState.trainPosition) * 3.6)} km/h
            </span>
          </div>

          <div className="flex flex-col py-1.5 border-r border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono tracking-wider">ENERGY LEVEL</span>
            <span className={`text-xs font-bold font-mono ${gameState.energy < 20 ? 'text-red-500 animate-pulse' : 'text-amber-500'}`}>
              {Math.round(gameState.energy)}%
            </span>
          </div>

          <div className="flex flex-col py-1.5">
            <span className="text-[10px] text-slate-500 font-mono tracking-wider">DELIVERED PASSENGERS</span>
            <span className="text-xs font-bold text-slate-300 font-mono">
              {gameState.passengersDelivered} passengers
            </span>
          </div>
        </div>

        {/* CANVAS DRAWING BLOCK */}
        <div className="w-full relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col min-h-[320px]">
          {/* Main Visual Canvas */}
          <div className="flex-1 w-full bg-slate-950 relative">
            <canvas ref={canvasRef} className="block w-full h-[320px]" />

            {/* Boarding Overlay (HUD) */}
            {gameState.passengerStatus === 'boarding' && (
              <div className="absolute inset-x-0 bottom-16 flex flex-col items-center justify-center pointer-events-none">
                <div className="bg-slate-900/90 border border-emerald-500/30 px-6 py-3 rounded-lg shadow-lg flex flex-col items-center w-80 backdrop-blur-md">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-1.5">
                    <Users size={14} className="animate-bounce" />
                    <span>BOARDING PASSENGERS...</span>
                  </div>
                  <div className="w-full bg-slate-850 h-3 rounded-full overflow-hidden border border-slate-800">
                    <div 
                      className="bg-emerald-500 h-full transition-all duration-100 ease-out"
                      style={{ width: `${boardingProgressRef.current}%` }}
                    />
                  </div>
                  <div className="flex justify-between w-full text-[10px] font-mono text-slate-400 mt-1">
                    <span>Recharging: {Math.round(gameState.energy)}%</span>
                    <span>Progress: {Math.round(boardingProgressRef.current)}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Emergency locked overlay */}
            {gameState.emergencyBrakeActive && (
              <div className="absolute inset-0 bg-red-950/20 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none animate-pulse">
                <div className="bg-slate-900/95 border border-red-500 px-6 py-4 rounded-lg shadow-xl text-center max-w-sm">
                  <AlertTriangle className="text-red-500 mx-auto mb-2" size={32} />
                  <h4 className="text-red-500 font-bold text-sm tracking-wide">EMERGENCY BRAKE VIOLATION</h4>
                  <p className="text-xs text-slate-300 mt-1 font-mono">Locked for {gameState.emergencyBrakeTimer.toFixed(1)} seconds</p>
                </div>
              </div>
            )}

            {/* Floating Status message strip */}
            {gameState.statusMessage && (
              <div className="absolute top-4 left-4 bg-slate-900/90 border border-slate-700/60 px-4 py-2 rounded-md shadow-md backdrop-blur-sm pointer-events-none">
                <p className="text-xs font-medium text-slate-200 font-mono tracking-tight">{gameState.statusMessage}</p>
              </div>
            )}
          </div>
        </div>

        {/* CONTROLS & GAUGES METERS */}
        <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-4">
          
          {/* DIGITAL SPEEDOMETER & TELEMETRY */}
          <div className="md:col-span-4 bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between items-center relative">
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 self-start border-b border-slate-800 w-full pb-1.5">
              <Gauge size={12} />
              <span>DIAGNOSTIC INSTRUMENTATION</span>
            </div>

            <div className="flex items-baseline gap-2 py-4">
              <span className="text-5xl font-black font-mono tracking-tighter text-amber-500">
                {Math.round(gameState.trainSpeed * 3.6)}
              </span>
              <span className="text-sm font-bold text-slate-400">km/h</span>
            </div>

            <div className="w-full grid grid-cols-2 gap-4 mt-2 border-t border-slate-800 pt-3">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-mono uppercase">Odometer</span>
                <span className="text-xs font-bold font-mono text-slate-300">{(gameState.trainPosition / 1000).toFixed(3)} km</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-mono uppercase">Score</span>
                <span className="text-xs font-bold font-mono text-amber-400">{gameState.score} pts</span>
              </div>
            </div>
          </div>

          {/* ACTIVE SPEED LEVER CONTROLLER */}
          <div className="md:col-span-5 bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 border-b border-slate-800 pb-1.5 mb-2.5">
              <Zap size={12} className="text-amber-500" />
              <span>POWER THROTTLE & BRAKE SYSTEM</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onMouseDown={() => {
                  if (gameState.passengerStatus === 'idle' && !gameState.emergencyBrakeActive) {
                    stateRef.current.controlState = 'accelerate';
                  }
                }}
                onMouseUp={() => {
                  if (stateRef.current.controlState === 'accelerate') {
                    stateRef.current.controlState = 'coast';
                  }
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  if (gameState.passengerStatus === 'idle' && !gameState.emergencyBrakeActive) {
                    stateRef.current.controlState = 'accelerate';
                  }
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  if (stateRef.current.controlState === 'accelerate') {
                    stateRef.current.controlState = 'coast';
                  }
                }}
                disabled={gameState.emergencyBrakeActive || gameState.passengerStatus !== 'idle'}
                className={`py-6 flex flex-col items-center justify-center rounded-lg font-bold text-xs gap-2 transition select-none ${
                  gameState.controlState === 'accelerate'
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-800 text-emerald-400 hover:bg-slate-750 hover:text-emerald-300 border border-emerald-500/10'
                } disabled:opacity-40`}
              >
                <ArrowUp size={16} />
                ACCELERATE
                <span className="text-[8px] opacity-70">Up Arrow</span>
              </button>

              <button
                onClick={() => {
                  stateRef.current.controlState = 'coast';
                  if (soundEnabled) audio.stopBrakeSqueal();
                }}
                className={`py-6 flex flex-col items-center justify-center rounded-lg font-bold text-xs gap-2 transition select-none ${
                  gameState.controlState === 'coast'
                    ? 'bg-slate-700 text-slate-100 border border-slate-600 shadow-inner'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-slate-300 border border-slate-700'
                }`}
              >
                <Wind size={16} />
                COAST
                <span className="text-[8px] opacity-70">Neutral</span>
              </button>

              <button
                onMouseDown={() => {
                  stateRef.current.controlState = 'brake';
                }}
                onMouseUp={() => {
                  if (stateRef.current.controlState === 'brake') {
                    stateRef.current.controlState = 'coast';
                    if (soundEnabled) audio.stopBrakeSqueal();
                  }
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  stateRef.current.controlState = 'brake';
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  if (stateRef.current.controlState === 'brake') {
                    stateRef.current.controlState = 'coast';
                    if (soundEnabled) audio.stopBrakeSqueal();
                  }
                }}
                className={`py-6 flex flex-col items-center justify-center rounded-lg font-bold text-xs gap-2 transition select-none ${
                  gameState.controlState === 'brake'
                    ? 'bg-red-500 text-slate-950 shadow-lg shadow-red-500/20'
                    : 'bg-slate-800 text-red-400 hover:bg-slate-750 hover:text-red-300 border border-red-500/10'
                }`}
              >
                <ArrowDown size={16} />
                BRAKE
                <span className="text-[8px] opacity-70">Down Arrow</span>
              </button>
            </div>
            
            <p className="text-[9px] text-slate-500 font-mono text-center mt-2.5">
              💡 Tip: HOLD ACCELERATE to build speed. RELEASE keys to coast. HOLD BRAKE to slow down.
            </p>
          </div>

          {/* MISC CONTROLS PANEL */}
          <div className="md:col-span-3 bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 border-b border-slate-800 pb-1.5 mb-2.5">
              <Award size={12} className="text-amber-500" />
              <span>COCKPIT AUXILIARIES</span>
            </div>

            <button
              onMouseDown={() => {
                stateRef.current.hornActive = true;
                if (soundEnabled) audio.startHorn();
              }}
              onMouseUp={() => {
                stateRef.current.hornActive = false;
                if (soundEnabled) audio.stopHorn();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                stateRef.current.hornActive = true;
                if (soundEnabled) audio.startHorn();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stateRef.current.hornActive = false;
                if (soundEnabled) audio.stopHorn();
              }}
              className={`py-4 w-full flex flex-col items-center justify-center rounded-lg font-black text-xs gap-1.5 transition select-none ${
                gameState.hornActive
                  ? 'bg-amber-400 text-slate-950 shadow-lg'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-400/20'
              }`}
            >
              <Music size={14} />
              TRAIN HORN
              <span className="text-[8px] opacity-70">Spacebar</span>
            </button>

            <button
              onClick={startNewGame}
              className="py-2.5 w-full bg-slate-950 border border-slate-800 hover:border-slate-600 hover:bg-slate-850 text-slate-300 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition mt-2"
            >
              <RotateCcw size={13} />
              RESTART GAME
            </button>
          </div>

        </div>

      </main>

      {/* FOOTER METRICS */}
      <footer className="bg-slate-950 text-slate-600 py-3 text-center text-[10px] font-mono border-t border-slate-900">
        <span>© 2026 Train Simulator | Designed for HTML5 Canvas & Web Audio Synthesizer</span>
      </footer>

      {/* START INSTRUCTIONS / HOW TO PLAY MODAL OVERLAY */}
      {showInstructions && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center p-4 z-50 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-xl shadow-2xl p-6 relative flex flex-col gap-4">
            
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="p-2.5 bg-amber-500 text-slate-950 rounded-lg">
                <Gauge size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">2D Train Simulator Instructions</h3>
                <p className="text-xs text-slate-400">Master the physics of electric passenger rails</p>
              </div>
            </div>

            <div className="flex flex-col gap-3.5 text-xs text-slate-300">
              <p>
                Take control of a modern electric passenger locomotive. Navigate the high-speed track safety, stop accurately at 5 different stations, and monitor red light signals.
              </p>

              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">PHYSICS CONTROL</span>
                  <span className="text-slate-200">🚀 Accelerate: Hold <span className="text-amber-500 font-bold">UP ARROW / W</span></span>
                  <span className="text-slate-200">🛑 Brake: Hold <span className="text-amber-500 font-bold">DOWN ARROW / S</span></span>
                  <span className="text-slate-200">🍃 Coast: Release controls (no key)</span>
                </div>
                <div className="flex flex-col gap-1 border-l border-slate-800 pl-3">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">COCKPIT SIGNALS</span>
                  <span className="text-slate-200">📢 Horn: Hold <span className="text-amber-500 font-bold">SPACEBAR</span></span>
                  <span className="text-slate-200">🛑 Red Signals: Prepare to Stop!</span>
                  <span className="text-slate-200">⚡ Station Stopped: Auto-boarding</span>
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-800/80 pt-3">
                <h4 className="font-bold text-slate-200 uppercase text-[10px] tracking-wider">How to score points:</h4>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-400">
                  <li><strong className="text-emerald-400">Stop Accuracy</strong>: Stop the train center precisely at the glowing green <span className="text-emerald-400">STOP TARGET</span> on the station platform.</li>
                  <li><strong className="text-amber-400">On-Time Arrival</strong>: Arrive quickly to secure performance time bonuses.</li>
                  <li><strong className="text-red-400">Avoid Violations</strong>: Exceeding speed limits or overrunning red signals depletes your score severely!</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-2 items-center justify-end mt-4 pt-3 border-t border-slate-800">
              {!soundEnabled && (
                <button
                  onClick={handleToggleSound}
                  className="px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 transition"
                >
                  <Volume2 size={13} />
                  Enable Sounds
                </button>
              )}

              <button
                onClick={() => {
                  setShowInstructions(false);
                  audio.init();
                  audio.resume();
                  if (!gameState.gameStarted) {
                    startNewGame();
                  }
                }}
                className="px-5 py-2.5 text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 rounded-lg flex items-center gap-1.5 transition shadow-lg shadow-amber-500/10"
              >
                <Play size={13} fill="currentColor" />
                {gameState.gameStarted ? 'RESUME SIMULATION' : 'START SIMULATION'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* GAME OVER OVERLAY SCREEN */}
      {gameState.gameOver && (
        <div className="fixed inset-0 bg-slate-950/95 flex items-center justify-center p-4 z-50 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-xl shadow-2xl p-6 text-center flex flex-col gap-4">
            
            <CheckCircle2 className="text-emerald-400 mx-auto animate-bounce" size={48} />
            
            <div>
              <h3 className="text-xl font-bold text-slate-100 uppercase tracking-wide">Route Simulation Finished</h3>
              <p className="text-xs text-slate-400 mt-1">Telemetry log report parsed successfully</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col gap-2 text-left font-mono text-xs">
              <div className="flex justify-between border-b border-slate-900 pb-1.5">
                <span className="text-slate-500">FINAL SCORE:</span>
                <span className="text-amber-400 font-bold text-sm">{gameState.score} points</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Total Distance:</span>
                <span className="text-slate-200">{(gameState.trainPosition / 1000).toFixed(2)} km</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Perfect Stops:</span>
                <span className="text-emerald-400 font-bold">{statsRef.current.perfectStops}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Excellent Stops:</span>
                <span className="text-blue-400 font-bold">{statsRef.current.excellentStops}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Good Stops:</span>
                <span className="text-amber-400 font-bold">{statsRef.current.goodStops}</span>
              </div>
              <div className="flex justify-between text-[11px] text-red-400/85">
                <span>Signal Violations:</span>
                <span>{statsRef.current.signalViolations}</span>
              </div>
              <div className="flex justify-between text-[11px] text-red-400/85">
                <span>Speeding Warnings:</span>
                <span>{statsRef.current.speedingViolations}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              {gameState.energy <= 0 && gameState.trainSpeed === 0 
                ? "The locomotive ran out of backup electricity battery cells before the final yard terminal."
                : "The passenger route express train has completed its daily schedule safely!"}
            </p>

            <button
              onClick={startNewGame}
              className="py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/10 mt-2"
            >
              <RotateCcw size={14} />
              PLAY AGAIN / DRIVER RETRAINING
            </button>

          </div>
        </div>
      )}

    </div>
  );
}
