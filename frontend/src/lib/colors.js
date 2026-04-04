const USER_COLORS = [
  '#e05c5c', '#e07c5c', '#e0b05c', '#5ce07c', '#5cbce0',
  '#5c7ce0', '#a05ce0', '#e05ca0', '#5ce0b0', '#c0e05c',
]

export function getRandomColor() {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
}

export function getRandomName() {
  const adj = ['Quick', 'Sharp', 'Bold', 'Swift', 'Bright', 'Cool', 'Calm', 'Keen']
  const nouns = ['Fox', 'Owl', 'Bear', 'Wolf', 'Hawk', 'Lion', 'Deer', 'Eagle']
  return `${adj[Math.floor(Math.random() * adj.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`
}

let _name = null
let _color = null

export function getLocalUser() {
  if (!_name) _name = localStorage.getItem('user-name') || getRandomName()
  if (!_color) _color = localStorage.getItem('user-color') || getRandomColor()
  return { name: _name, color: _color }
}

export function setLocalUser(name, color) {
  _name = name
  _color = color
  localStorage.setItem('user-name', name)
  localStorage.setItem('user-color', color)
}
