export interface Station {
  id: string;
  name: string;
  position: number; // in meters along the track
  platformLength: number; // width of stop target in meters
  passengerCount: number;
  hasVisited: boolean;
}

export interface Signal {
  id: string;
  position: number; // in meters along the track
  state: 'RED' | 'GREEN';
  timer: number; // time remaining for current state in seconds
  durationRed: number;
  durationGreen: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  type: 'smoke' | 'spark' | 'bubble';
}

export interface Passenger {
  id: string;
  x: number;
  y: number;
  targetX: number;
  state: 'waiting' | 'boarding' | 'onboard' | 'disembarking' | 'gone';
  color: string;
  bounceOffset: number;
}

export interface GameState {
  trainPosition: number; // in meters
  trainSpeed: number; // in m/s
  trainAcceleration: number; // current acceleration m/s^2
  controlState: 'accelerate' | 'brake' | 'coast';
  energy: number; // 0 to 100
  score: number;
  distanceTraveled: number; // in meters
  currentStationId: string | null;
  passengerStatus: 'idle' | 'boarding' | 'disembarking' | 'completed';
  timeElapsed: number; // in seconds
  totalTime: number; // elapsed in current game
  gameOver: boolean;
  gameStarted: boolean;
  statusMessage: string;
  statusTimer: number; // seconds to show message
  hornActive: boolean;
  emergencyBrakeActive: boolean;
  emergencyBrakeTimer: number; // time left in emergency penalty
  passengersDelivered: number;
}
