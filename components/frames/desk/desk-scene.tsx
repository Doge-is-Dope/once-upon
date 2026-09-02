// The blotter under everything: a fixed layer of green wool felt with the
// lamp's pool and the room's vignette. Purely decorative; the WebGL lamp
// relights it and the sheet casts its shadow onto it.
export function DeskScene() {
  return (
    <div aria-hidden="true" className="desk-scene">
      <div className="desk-felt" />
      <div className="desk-vignette" />
    </div>
  );
}
