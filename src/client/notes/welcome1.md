# Welcome!

Unforget is a minimalist, offline-first, and end-to-end encrypted note-taking app (without Electron.js) featuring:

- [x] Offline first
- [x] Privacy first
- [x] Progressive web app
- [x] Open source MIT License
- [x] End-to-end encrypted sync
- [x] Desktop, Mobile, Web
- [x] Markdown support
- [x] Self hosted and cloud options
- [x] One-click data export as JSON
- [x] Optional one-click installation
- [x] Public APIs, create your own client
- [x] Import Google Keep
- [x] Import Apple Notes
- [x] Import Standard Notes


*Unforget is made by [Computing Den](https://computing-den.com), a software company specializing in web technologies.*

*Contact us at sean@computing-den.com*

# Easy Signup

[Sign up](/login) for free to back up your notes safely to the cloud fully encrypted and sync across devices.

*No email or phone required.*

# Optional installation

Use it directly in your browser or install:

| Browser         | Installation                |
|-----------------|-----------------------------|
| Chrome          | Install icon in the URL bar |
| Edge            | Install icon in the URL bar |
| Android Browser | Menu → Add to Home Screen   |
| Safari Desktop  | Share → Add to Dock         |
| Safari iOS      | Share → Add to Home Screen  |
| Firefox Desktop | *cannot install*            |
| Firefox Android | Install icon in the URL bar |

# Organization and Workflow

---

The notes are organized **chronologically**, with pinned notes displayed at the top.

This organization has proven very effective despite its simplicity. The **search is very fast** (and done offline), allowing you to quickly narrow down notes by entering a few phrases. Additionally, you can search for non-alphabetic characters, enabling the use of **tags** such as #idea, #project, #work, #book, etc.

There is **no limit** to the size of a note. For larger notes, you can insert a `---` on a line by itself to **collapse** the rest of the note.

Notes are **immediately saved** as you type and synced every few seconds.

If you edit a note from two devices and a **conflict** occurs during sync, the most recent edit will take precedence.

# Security and Privacy

Unforget does not receive or store any personal data. No email or phone is required to sign up. As long as you pick a strong password, your notes will be stored in the cloud fully encrypted and safe.

Only your username and note modification dates are visible to Unforget servers.

# Text Formatting

The main differences with the [Github flavored markdown](https://github.github.com/gfm/) are:
- If the first line of a note is followed by a blank line, it is a H1 header.
- Anything after the first horizontal rule `---` in a note will be hidden and replaced with a "show more" button that will expand the note.

~~~
# H1 header
## H2 header
### H3 header
#### H4 header
##### H5 header
###### H6 header

*This is italic.*.

**This is bold.**.

***This is bold and italic.***

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


Horizontal rule:

---


~~~
