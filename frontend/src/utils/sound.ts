import { Vibration } from 'react-native';
import Sound from 'react-native-sound';

Sound.setCategory('Playback');

let alertSound: Sound | null = null;

// Optional: android/app/src/main/res/raw/alert.mp3 rakh do.
// File na ho to bhi app crash nahi hoga, sirf vibration hoga.
function loadSound() {
  if (alertSound) {
    return;
  }
  alertSound = new Sound('alert.mp3', Sound.MAIN_BUNDLE, error => {
    if (error) {
      alertSound = null;
    }
  });
}

export function playPhishingAlert() {
  Vibration.vibrate([0, 400, 200, 400]);
  loadSound();
  if (alertSound) {
    alertSound.stop(() => alertSound?.play());
  }
}

export function playSafeTone() {
  Vibration.vibrate(80);
}
