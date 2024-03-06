// function NoteEditor(props: { note: t.Note }) {
//   const [text, setText] = useState(props.note.text);

//   const textChanged = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
//     setText(e.target.value);
//   }, []);

//   useEffect(() => {
//     const dialog = document.getElementById('note-editor') as HTMLDialogElement;
//     dialog.showModal();

//     function resize() {
//       console.log('height', window.visualViewport!.height);
//       dialog.style.height = `${window.visualViewport!.height}px`;
//     }
//     window.visualViewport!.addEventListener('resize', resize);
//     return () => window.visualViewport!.removeEventListener('resize', resize);
//   }, []);

//   return (
//     <dialog id="note-editor">
//       <textarea
//         className="text-input"
//         placeholder="Write your note ..."
//         value={text}
//         onChange={textChanged}
//         autoFocus
//       />
//     </dialog>
//   );
// }
