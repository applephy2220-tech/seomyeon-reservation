const fs = require('fs');
const path = require('path');

// Beautiful base64 of a dark purple 192x192 PWA mock icon
const ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEgAACxIB0t1+/AAAABZ0RVh0Q3JlYXRpb24gVGltZQAwNS8yMS8yNquuG48AAAAcdEVYdFNvZnR3YXJlAEFkb2JlIEZpcmV3b3JrcyBDUzversiont6nQAAACl0RVh0UmVmZXJlbmNlAHNvbXlvbmUtcmVzZXJ2YXRpb24tcHdhLW1vY2stY2FudmFzpcjVAAAAdUlEQVR4nO3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgbwBu4AAB77P17gAAAABJRU5ErkJggg==';

const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)){
    fs.mkdirSync(iconsDir, { recursive: true });
}

const buffer = Buffer.from(ICON_BASE64, 'base64');
fs.writeFileSync(path.join(iconsDir, 'icon-192x192.png'), buffer);
fs.writeFileSync(path.join(iconsDir, 'icon-512x512.png'), buffer);

console.log('PWA default neon icons generated successfully under public/icons/');
