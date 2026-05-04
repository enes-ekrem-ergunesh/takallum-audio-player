import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Play, Pause, Volume2, FastForward, Rewind, Music, RotateCcw, RotateCw, SlidersHorizontal, Gauge } from 'lucide-react';

function App() {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Interaction states
  const [is2xSpeed, setIs2xSpeed] = useState(false);
  const [volume, setVolume] = useState(1);
  const [volVisible, setVolVisible] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [showVolumeModal, setShowVolumeModal] = useState(false);
  
  const [skipLeft, setSkipLeft] = useState(0);
  const [skipRight, setSkipRight] = useState(0);
  const [skipLeftVisible, setSkipLeftVisible] = useState(false);
  const [skipRightVisible, setSkipRightVisible] = useState(false);
  
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef(null);
  
  useEffect(() => {
    clearTimeout(controlsTimeout.current);
    if (isPlaying && showControls) {
      controlsTimeout.current = setTimeout(() => setShowControls(false), 4000);
    }
  }, [isPlaying, showControls, currentTime]);
  
  // Refs for tracking gestures
  const lastTap = useRef(null);
  const swipeStart = useRef(null);
  const isSwiping = useRef(false);
  const swipeDirection = useRef(null);
  
  // Timers
  const longPressTimer = useRef(null);
  const volTimer = useRef(null);
  const skipLeftTimer = useRef(null);
  const skipRightTimer = useRef(null);
  
  const progressBarRef = useRef(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  const initAudioVisualizer = () => {
    if (!audioContextRef.current && audioRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext();
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 128;
      
      sourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    }
  };

  useLayoutEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && canvasRef.current.parentElement) {
        const rect = canvasRef.current.parentElement.getBoundingClientRect();
        canvasRef.current.width = rect.width;
        canvasRef.current.height = rect.height;
      }
    };
    window.addEventListener('resize', handleResize);
    // Initial size setting
    setTimeout(handleResize, 0); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const drawVisualizer = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    analyserRef.current.getByteFrequencyData(dataArray);
    
    ctx.clearRect(0, 0, width, height);
    
    const activeBins = 32; // Focus on the lower/mid frequencies
    const totalBars = activeBins * 2;
    const visualWidth = width * 2.55; // Slightly reduced horizontal zoom (was 3x)
    const barWidth = (visualWidth / totalBars) * 0.85;
    const gap = (visualWidth / totalBars) * 0.15;
    const center = width / 2;
    
    // Soft, pleasing colors
    const colors = ['#FF6B6B', '#FFA06B', '#FFD166', '#06D6A0', '#118AB2', '#8338EC'];
    
    for (let i = 0; i < activeBins; i++) {
      const time = Date.now() / 1000;
      // Idle animation so it breathes when quiet
      const idle = Math.abs(Math.sin(i * 0.1 + time * 1.5)) * (height * 0.1);
      const value = dataArray[i];
      
      // Slightly reduced vertical zoom (was 1.2x)
      let barHeight = (value / 255) * (height * 1.05) + idle;
      if (barHeight < height * 0.05) barHeight = height * 0.05;
      
      const color = colors[i % colors.length];
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5; // Soft translucency
      
      const xOffset = i * (barWidth + gap);
      const yOffset = height - barHeight;
      
      // Right side
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(center + xOffset, yOffset, barWidth, barHeight, barWidth / 2);
      } else {
        ctx.fillRect(center + xOffset, yOffset, barWidth, barHeight);
      }
      ctx.fill();
      
      // Left side mirrored
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(center - xOffset - barWidth, yOffset, barWidth, barHeight, barWidth / 2);
      } else {
        ctx.fillRect(center - xOffset - barWidth, yOffset, barWidth, barHeight);
      }
      ctx.fill();
    }
    
    animationRef.current = requestAnimationFrame(drawVisualizer);
  };

  useEffect(() => {
    if (isPlaying) {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      animationRef.current = requestAnimationFrame(drawVisualizer);
    } else {
      cancelAnimationFrame(animationRef.current);
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying]);

  useEffect(() => {
    // Initial setup
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    
    // Clean up timers
    return () => {
      clearTimeout(longPressTimer.current);
      clearTimeout(volTimer.current);
      clearTimeout(skipLeftTimer.current);
      clearTimeout(skipRightTimer.current);
    };
  }, []);

  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    initAudioVisualizer();
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const [isScrubbing, setIsScrubbing] = useState(false);

  const updateProgressFromEvent = (e) => {
    if (progressBarRef.current && audioRef.current && duration > 0) {
      const rect = progressBarRef.current.getBoundingClientRect();
      let pos = (e.clientX - rect.left) / rect.width;
      pos = Math.max(0, Math.min(1, pos));
      audioRef.current.currentTime = pos * duration;
    }
  };

  const handleProgressPointerDown = (e) => {
    e.stopPropagation();
    if (e.target.setPointerCapture) {
      e.target.setPointerCapture(e.pointerId);
    }
    setIsScrubbing(true);
    updateProgressFromEvent(e);
  };

  const handleProgressPointerMove = (e) => {
    if (isScrubbing) {
      e.stopPropagation();
      updateProgressFromEvent(e);
    }
  };

  const handleProgressPointerUp = (e) => {
    if (isScrubbing) {
      e.stopPropagation();
      if (e.target.releasePointerCapture) {
        e.target.releasePointerCapture(e.pointerId);
      }
      setIsScrubbing(false);
    }
  };

  // -- Gestures --
  
  const handlePointerDown = (e) => {
    // Only handle primary pointer (usually touch or left click)
    if (!e.isPrimary) return;
    setShowControls(true);

    swipeStart.current = { 
      x: e.clientX,
      y: e.clientY, 
      vol: audioRef.current?.volume || 1,
      time: audioRef.current?.currentTime || 0
    };
    isSwiping.current = false;
    swipeDirection.current = null;
    
    longPressTimer.current = setTimeout(() => {
      if (!isSwiping.current) {
        setIs2xSpeed(true);
        if (audioRef.current) {
          audioRef.current.playbackRate = 2;
        }
      }
    }, 500);
  };

  const handlePointerMove = (e) => {
    if (!e.isPrimary) return;

    if (swipeStart.current) {
      const deltaX = e.clientX - swipeStart.current.x;
      const deltaY = e.clientY - swipeStart.current.y;
      
      // Threshold to start swiping
      if (!isSwiping.current) {
        if (Math.abs(deltaX) > 15 || Math.abs(deltaY) > 15) {
          isSwiping.current = true;
          clearTimeout(longPressTimer.current); // cancel long press
          swipeDirection.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
        }
      }
      
      if (isSwiping.current) {
        if (swipeDirection.current === 'y') {
          // Adjust volume: 200px swipe = 100% volume change
          let newVol = swipeStart.current.vol - (deltaY / 200);
          newVol = Math.max(0, Math.min(1, newVol));
          if (audioRef.current) audioRef.current.volume = newVol;
          setVolume(newVol);
          setVolVisible(true);
          
          clearTimeout(volTimer.current);
          volTimer.current = setTimeout(() => setVolVisible(false), 1500);
        } else if (swipeDirection.current === 'x') {
          // Horizontal scrub: 150px swipe = 30s skip
          let newTime = swipeStart.current.time + (deltaX / 150) * 30;
          newTime = Math.max(0, Math.min(duration, newTime));
          if (audioRef.current) audioRef.current.currentTime = newTime;
          
          const diff = Math.round(newTime - swipeStart.current.time);
          if (diff > 0) {
            setSkipRight(diff);
            setSkipRightVisible(true);
            setSkipLeftVisible(false);
            clearTimeout(skipRightTimer.current);
            skipRightTimer.current = setTimeout(() => setSkipRightVisible(false), 1000);
          } else if (diff < 0) {
            setSkipLeft(Math.abs(diff));
            setSkipLeftVisible(true);
            setSkipRightVisible(false);
            clearTimeout(skipLeftTimer.current);
            skipLeftTimer.current = setTimeout(() => setSkipLeftVisible(false), 1000);
          }
        }
      }
    }
  };

  const handlePointerUp = (e) => {
    if (!e.isPrimary) return;

    // Clean up long press
    clearTimeout(longPressTimer.current);
    if (is2xSpeed) {
      setIs2xSpeed(false);
      if (audioRef.current) audioRef.current.playbackRate = playbackRate;
      swipeStart.current = null;
      return;
    }
    
    // Clean up swipe
    if (isSwiping.current) {
      swipeStart.current = null;
      isSwiping.current = false;
      return;
    }
    
    swipeStart.current = null;

    // Handle Tap (neither swiped nor long-pressed)
    const { clientX } = e;
    const isRight = clientX > window.innerWidth / 2;
    const now = Date.now();
    
    if (lastTap.current) {
      const { time, side } = lastTap.current;
      if (now - time < 350 && side === (isRight ? 'right' : 'left')) {
        // Double/Triple tap confirmed
        const increment = isRight ? 5 : -5;
        
        if (audioRef.current) {
          audioRef.current.currentTime += increment;
        }
        
        if (isRight) {
          setSkipRight(prev => skipRightVisible ? prev + 5 : 5);
          setSkipRightVisible(true);
          setSkipLeftVisible(false);
          clearTimeout(skipRightTimer.current);
          skipRightTimer.current = setTimeout(() => setSkipRightVisible(false), 1000);
        } else {
          setSkipLeft(prev => skipLeftVisible ? prev + 5 : 5);
          setSkipLeftVisible(true);
          setSkipRightVisible(false);
          clearTimeout(skipLeftTimer.current);
          skipLeftTimer.current = setTimeout(() => setSkipLeftVisible(false), 1000);
        }
        
        lastTap.current = { time: now, side: isRight ? 'right' : 'left' };
        return;
      }
    }
    
    // Register first tap
    lastTap.current = { time: now, side: isRight ? 'right' : 'left' };
  };

  // Progress calculations
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="player-container">
      <canvas 
        ref={canvasRef} 
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: '100%', height: '100%',
          zIndex: 0, pointerEvents: 'none'
        }}
      />
      
      {/* Invisible interaction layer covering the screen */}
      <div 
        className="interaction-layer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      
      {(showSpeedModal || showVolumeModal) && (
        <div 
          className="modal-overlay" 
          onPointerDown={() => { setShowSpeedModal(false); setShowVolumeModal(false); }} 
        >
          {showSpeedModal && (
            <div className="center-modal" onPointerDown={e => e.stopPropagation()}>
              <div className="modal-title">{playbackRate}x Speed</div>
              <input 
                type="range" 
                className="modal-slider large"
                min="0.25" max="3" step="0.25" 
                value={playbackRate} 
                onChange={(e) => {
                  const rate = parseFloat(e.target.value);
                  setPlaybackRate(rate);
                  if (audioRef.current && !is2xSpeed) {
                    audioRef.current.playbackRate = rate;
                  }
                }} 
              />
            </div>
          )}
          
          {showVolumeModal && (
            <div className="center-modal" onPointerDown={e => e.stopPropagation()}>
              <div className="modal-title">{Math.round(volume * 100)}% Volume</div>
              <input 
                type="range" 
                className="modal-slider large"
                min="0" max="1" step="0.05" 
                value={volume} 
                onChange={(e) => {
                  const vol = parseFloat(e.target.value);
                  setVolume(vol);
                  if (audioRef.current) audioRef.current.volume = vol;
                }} 
              />
            </div>
          )}
        </div>
      )}
      
      {/* Overlays for Gestures */}
      <div className="indicator-overlay">
        {is2xSpeed && (
          <div className="speed-indicator">2x Speed</div>
        )}
        
        <div className={`skip-indicator left ${skipLeftVisible ? 'visible' : ''}`}>
          <Rewind size={32} />
          <div className="skip-text">-{skipLeft}s</div>
        </div>
        
        <div className={`skip-indicator right ${skipRightVisible ? 'visible' : ''}`}>
          <FastForward size={32} />
          <div className="skip-text">+{skipRight}s</div>
        </div>
        
        <div className={`volume-indicator ${volVisible ? 'visible' : ''}`}>
          <Volume2 size={24} color="var(--primary)" />
          <div className="volume-bar-bg">
            <div className="volume-fill" style={{ height: `${volume * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Main UI */}
      <div className="ui-layer">
        <div className="header">
        </div>
        
        <div className="artwork-container">
          {/* Background visualizer covers this area */}
        </div>
        
        <div className="help-text">
          Double-tap or swipe horizontally to skip • Swipe vertically for volume • Hold for 2x speed
        </div>

        <button 
          className={`controls-toggle ${!showControls ? 'visible' : ''}`}
          onClick={(e) => { e.stopPropagation(); setShowControls(true); }}
        >
          <SlidersHorizontal size={24} />
        </button>

        <div className={`controls-section ${!showControls ? 'hidden' : ''}`}>
          <div className="progress-container">
            <div 
              className="progress-bar-bg" 
              ref={progressBarRef}
              onPointerDown={handleProgressPointerDown}
              onPointerMove={handleProgressPointerMove}
              onPointerUp={handleProgressPointerUp}
              onPointerCancel={handleProgressPointerUp}
              style={{ touchAction: 'none' }}
            >
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              <div className="progress-thumb" style={{ left: `${progressPercent}%` }} />
            </div>
            <div className="time-info">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          
          <div className="main-controls">
            <div style={{ position: 'relative' }}>
              <button 
                className={`btn ${showSpeedModal ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setShowSpeedModal(!showSpeedModal); setShowVolumeModal(false); }}
              >
                <Gauge size={22} color={showSpeedModal ? 'var(--primary)' : 'currentColor'} />
              </button>
            </div>

            <button 
              className="skip-btn secondary" 
              onClick={(e) => {
                e.stopPropagation();
                if (audioRef.current) audioRef.current.currentTime -= 30;
              }}
            >
              <RotateCcw size={22} />
              <span className="skip-btn-text">30</span>
            </button>
            <button 
              className="skip-btn" 
              onClick={(e) => {
                e.stopPropagation();
                if (audioRef.current) audioRef.current.currentTime -= 10;
              }}
            >
              <RotateCcw size={28} />
              <span className="skip-btn-text">10</span>
            </button>
            
            <button className="btn btn-play" onClick={togglePlay}>
              {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
            </button>
            
            <button 
              className="skip-btn" 
              onClick={(e) => {
                e.stopPropagation();
                if (audioRef.current) audioRef.current.currentTime += 10;
              }}
            >
              <RotateCw size={28} />
              <span className="skip-btn-text">10</span>
            </button>
            <button 
              className="skip-btn secondary" 
              onClick={(e) => {
                e.stopPropagation();
                if (audioRef.current) audioRef.current.currentTime += 30;
              }}
            >
              <RotateCw size={22} />
              <span className="skip-btn-text">30</span>
            </button>

            <div style={{ position: 'relative' }}>
              <button 
                className={`btn ${showVolumeModal ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setShowVolumeModal(!showVolumeModal); setShowSpeedModal(false); }}
              >
                <Volume2 size={22} color={showVolumeModal ? 'var(--primary)' : 'currentColor'} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <audio 
        ref={audioRef}
        src="/sample.mp3"
        crossOrigin="anonymous"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  );
}

export default App;
