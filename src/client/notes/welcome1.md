# Welcome!

Unforget is a minimalist note-taking app featuring:

- [x] Import from Google Keep
- [x] Offline first
- [x] Priavcy first
- [x] End-to-end encrypted sync
- [x] Desktop, Mobile, Web
- [x] Progressive web app, no Electron.js
- [x] Markdown support
- [x] Self hosted and cloud options
- [x] One-click data export as JSON
- [x] Optional one-click installation
- [x] Public APIs, create your own clients
- [x] Open source
- [ ] Import from Apple Notes, coming soon


*Unforget is made by [Computing Den](https://computing-den.com), a software company specializing in web technologies.*


# Optional Installation

Use it directly in your browser or install:

- Chrome / Edge: Install icon in the URL bar
- iOS Safari: Share → Add to Home Screen
- Android Browser: Menu → Add to Home Screen

*Note: Desktop Safari and Firefox do not support installing Progressive Web Apps.*

# Easy Text Formatting with Markdown

---

The main differences with the [Github markdown](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet) is that:
- If the first line of a note is followed by a blank line, it is a H1 header.
- Anything after the first horizontal rule `---` in a note will be hidden and replaced with a "show more" button that will expand the note.

~~~
# Also a H1 header
## H2 header
### H3 header

*This is italics.*.

**This is bold.**.

***This is bold and italics.***

~~This is strikethrough~~


- This is a bullet point
- Another bullet point
  - Inner bullet point
- [ ] This is a checkbox
  And more text related to the checkbox.

1. This is an ordered list item
2. And another one

[this is a link](https://unforget.computing-den.com)

Inline `code` using back-ticks.

Block of code:

```javascript
function plusOne(a) {
  return a + 1;
}
```


| Tables        | Are           | Cool  |
| ------------- |:-------------:| -----:|
| col 3 is      | right-aligned | $1600 |
| col 2 is      | centered      |   $12 |
| zebra stripes | are neat      |    $1 |

Horizontal rule:

---


~~~
