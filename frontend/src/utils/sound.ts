import Sound from 'react-native-sound';

Sound.setCategory('Playback');

const loadSound = (filename: string) => {
  return new Sound(filename, Sound.MAIN_BUNDLE, (error) => {
    if (error) console.log(`Failed to load ${filename}`, error);
  });
};

export const sounds = {
  scan: loadSound('scan.mp3'),
  threat: loadSound('threat_alert.mp3'),
  safe: loadSound('safe_beep.mp3'),
  play(type: 'scan' | 'threat' | 'safe') {
    sounds[type]?.play((success) => {
      if (!success) sounds[type]?.reset();
    });
  }
};