module.exports = class Lyric {
  static timeExp = /^\[([\d:.]*)\]{1}/g
  static tagRegMap = {
    title: 'ti',
    artist: 'ar',
    album: 'al',
    offset: 'offset',
    by: 'by',
  }

  // eslint-disable-next-line no-undef
  static getNow = typeof performance == 'object' && performance.now ? performance.now.bind(performance) : Date.now.bind(Date)

  static timeoutTools = {
    invokeTime: 0,
    animationFrameId: null,
    timeoutId: null,
    callback: null,
    thresholdTime: 200,

    run() {
      this.animationFrameId = window.requestAnimationFrame(() => {
        this.animationFrameId = null
        let diff = this.invokeTime - Lyric.getNow()
        if (diff > 0) {
          if (diff < this.thresholdTime) return this.run()
          return this.timeoutId = setTimeout(() => {
            this.timeoutId = null
            this.run()
          }, diff - this.thresholdTime)
        }

        this.callback(diff)
      })
    },
    start(callback = () => { }, timeout = 0) {
      this.callback = callback
      this.invokeTime = Lyric.getNow() + timeout

      this.run()
    },
    clear() {
      if (this.animationFrameId) {
        window.cancelAnimationFrame(this.animationFrameId)
        this.animationFrameId = null
      }
      if (this.timeoutId) {
        window.clearTimeout(this.timeoutId)
        this.timeoutId = null
      }
    },
  }

  constructor({ lyric = '', extendedLyrics = [], offset = 150, onPlay = function() { }, onSetLyric = function() { }, isRemoveBlankLine = true } = {}) {
    this.lyric = lyric
    this.extendedLyrics = extendedLyrics
    this.tags = {}
    this.lines = null
    this.onPlay = onPlay
    this.onSetLyric = onSetLyric
    this.isPlay = false
    this.curLineNum = 0
    this.maxLine = 0
    this.offset = offset
    this._performanceTime = 0
    this._startTime = 0
    this.isRemoveBlankLine = isRemoveBlankLine
    this._init()
  }

  _init() {
    if (this.lyric == null) this.lyric = ''
    if (this.extendedLyrics == null) this.extendedLyrics = []
    this._initTag()
    this._initLines()
    this.onSetLyric(this.lines)
  }

  _initTag() {
    this.tags = {}
    for (let tag in Lyric.tagRegMap) {
      const matches = this.lyric.match(new RegExp(`\\[${Lyric.tagRegMap[tag]}:([^\\]]*)]`, 'i'))
      this.tags[tag] = (matches && matches[1]) || ''
    }
    if (this.tags.offset) {
      let offset = parseInt(this.tags.offset)
      this.tags.offset = Number.isNaN(offset) ? 0 : offset
    } else {
      this.tags.offset = 0
    }
  }

  _initLines() {
    this.lines = []
    const lines = this.lyric.split(/\r\n|\n|\r/)
    const linesMap = {}
    const length = lines.length
    for (let i = 0; i < length; i++) {
      const line = lines[i].trim()
      let result = Lyric.timeExp.exec(line)
      if (result) {
        const text = this.isRemoveBlankLine ? line.replace(Lyric.timeExp, '').trim() : (line.replace(Lyric.timeExp, '').trim() || '&nbsp;')
        if (text || !this.isRemoveBlankLine) {
          const timeStr = RegExp.$1.replace(/(\.\d\d)0$/, '$1')
          const timeArr = timeStr.split(':')
          if (timeArr.length < 3) timeArr.unshift(0)
          if (timeArr[2].indexOf('.') > -1) {
            timeArr.push(...timeArr[2].split('.'))
            timeArr.splice(2, 1)
          }

          linesMap[timeStr] = {
            time: parseInt(timeArr[0]) * 60 * 60 * 1000 + parseInt(timeArr[1]) * 60 * 1000 + parseInt(timeArr[2]) * 1000 + parseInt(timeArr[3] || 0),
            text,
            extendedLyrics: [],
          }
        }
      }
    }

    for (const lrc of this.extendedLyrics) this._parseExtendedLyric(linesMap, lrc)
    this.lines = Object.values(linesMap)
    this.lines.sort((a, b) => {
      return a.time - b.time
    })
    this.maxLine = this.lines.length - 1
  }

  _currentTime() {
    return Lyric.getNow() - this._performanceTime + this._startTime
  }

  _findCurLineNum(curTime, startIndex = 0) {
    if (curTime <= 0) return 0
    const length = this.lines.length
    for (let index = startIndex; index < length; index++) if (curTime <= this.lines[index].time) return index === 0 ? 0 : index - 1
    return length - 1
  }

  _handleMaxLine() {
    this.onPlay(this.curLineNum, this.lines[this.curLineNum].text)
    this.pause()
  }

  _refresh() {
    this.curLineNum++
    if (this.curLineNum >= this.maxLine) return this._handleMaxLine()

    let curLine = this.lines[this.curLineNum]

    const currentTime = this._currentTime()
    const driftTime = currentTime - curLine.time

    if (driftTime >= 0 || this.curLineNum === 0) {
      let nextLine = this.lines[this.curLineNum + 1]
      this.delay = nextLine.time - curLine.time - driftTime

      if (this.delay > 0) {
        if (this.isPlay) {
          Lyric.timeoutTools.start(() => {
            if (!this.isPlay) return
            this._refresh()
          }, this.delay)
        }
        this.onPlay(this.curLineNum, curLine.text)
        return
      } else {
        let newCurLineNum = this._findCurLineNum(currentTime, this.curLineNum + 1)
        if (newCurLineNum > this.curLineNum) this.curLineNum = newCurLineNum - 1
        this._refresh()
        return
      }
    }

    this.curLineNum = this._findCurLineNum(currentTime, this.curLineNum) - 1
    this._refresh()
  }

  play(curTime = 0) {
    if (!this.lines.length) return
    this.pause()
    this.isPlay = true

    this._performanceTime = Lyric.getNow() - parseInt(this.tags.offset + this.offset)
    this._startTime = curTime

    this.curLineNum = this._findCurLineNum(this._currentTime()) - 1

    this._refresh()
  }

  pause() {
    if (!this.isPlay) return
    this.isPlay = false
    Lyric.timeoutTools.clear()
    if (this.curLineNum === this.maxLine) return
    const curLineNum = this._findCurLineNum(this._currentTime())
    if (this.curLineNum !== curLineNum) {
      this.curLineNum = curLineNum
      this.onPlay(curLineNum, this.lines[curLineNum].text)
    }
  }

  setLyric(lyric, extendedLyrics) {
    if (this.isPlay) this.pause()
    this.lyric = lyric
    this.extendedLyrics = extendedLyrics
    this._init()
  }

  _parseExtendedLyric(lrcLinesMap, extendedLyric) {
    const extendedLines = extendedLyric.split(/\r\n|\n|\r/)
    for (let i = 0; i < extendedLines.length; i++) {
      const line = extendedLines[i].trim()
      let result = Lyric.timeExp.exec(line)
      if (result) {
        const text = this.isRemoveBlankLine ? line.replace(Lyric.timeExp, '').trim() : (line.replace(Lyric.timeExp, '').trim() || '&nbsp;')
        if (text) {
          const timeStr = RegExp.$1.replace(/(\.\d\d)0$/, '$1')
          const targetLine = lrcLinesMap[timeStr]
          if (targetLine) targetLine.extendedLyrics.push(text)
        }
      }
    }
  }
}
