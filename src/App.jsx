import { useEffect, useMemo, useRef, useState } from "react";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";
import { generateClient } from "aws-amplify/data";
import { uploadData, getUrl, remove } from "aws-amplify/storage";
import { Authenticator, View, Heading, Text, Button, TextField, Flex, Image, Divider } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import "./App.css";

// Configure Amplify from the generated outputs
Amplify.configure(outputs);

// Create a single data client for the app
const client = generateClient();

export default function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <MainApp user={user} onSignOut={signOut} />
      )}
    </Authenticator>
  );
}

function MainApp({ user, onSignOut }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const fileInputRef = useRef(null);

  // Fetch all notes belonging to the signed-in user
  const fetchNotes = async () => {
    setLoading(true);
    try {
      // If your model name differs, update models.Note accordingly
      const { data, errors } = await client.models.Note.list();
      if (errors?.length) console.warn("List errors:", errors);

      // Resolve image URLs if we have a storage key
      const withUrls = await Promise.all(
        (data || []).map(async (n) => {
          if (!n?.imageKey) return n;
          try {
            const url = await getUrl({ path: n.imageKey });
            return { ...n, imageUrl: url?.url?.toString?.() };
          } catch (e) {
            console.warn("Could not load image for note", n.id, e);
            return n;
          }
        })
      );
      setNotes(withUrls);
    } catch (err) {
      console.error("Failed to fetch notes", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create a new note (and upload optional image)
  const createNote = async (e) => {
    e?.preventDefault?.();
    if (!title.trim() && !content.trim()) return;

    setCreating(true);
    let imageKey = undefined;

    try {
      // Upload optional image first so we can save its key on the note
      if (file) {
        const result = await uploadData({
          data: file,
          // Storage rule uses "media/{entity_id}/*". Build a per-user path:
          path: ({ identityId }) => `media/${identityId}/${Date.now()}-${file.name}`,
        }).result;
        imageKey = result?.path || result?.key || undefined;
      }

      // Save the note
      const { data: created, errors } = await client.models.Note.create({
        title: title.trim() || "Untitled",
        content: content.trim(),
        imageKey,
      });
      if (errors?.length) console.warn("Create errors:", errors);

      // Clear the form
      setTitle("");
      setContent("");
      setFile(null);
      setPreview("");
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Refresh list
      await fetchNotes();
      return created;
    } catch (err) {
      console.error("Failed to create note", err);
    } finally {
      setCreating(false);
    }
  };

  // Delete a note and its image if present
  const deleteNote = async (note) => {
    if (!note) return;
    try {
      await client.models.Note.delete({ id: note.id });
      if (note.imageKey) {
        // Best-effort removal of the file
        await remove({ path: note.imageKey }).catch(() => {});
      }
      await fetchNotes();
    } catch (err) {
      console.error("Failed to delete note", err);
    }
  };

  // Preview selected image
  useEffect(() => {
    if (!file) return setPreview("");
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <View className="App" padding="1rem" maxWidth="900px" margin="0 auto">
      <Flex justifyContent="space-between" alignItems="center" marginBlockEnd="1rem">
        <Heading level={3}>Amplify Notes</Heading>
        <Flex gap="0.5rem" alignItems="center">
          <Text variation="tertiary">{user?.signInDetails?.loginId || user?.username}</Text>
          <Button onClick={onSignOut} variation="primary">Sign out</Button>
        </Flex>
      </Flex>

      {/* Create Note Form */}
      <View as="form" onSubmit={createNote} className="card" style={{ padding: 16 }}>
        <Heading level={5} marginBlockEnd="0.5rem">Create a note</Heading>
        <Flex direction="column" gap="0.75rem">
          <TextField
            label="Title"
            placeholder="My first note"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            label="Content"
            placeholder="Type something memorable…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            as="textarea"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {preview && (
            <Image
              alt="Selected preview"
              src={preview}
              width="200px"
              height="auto"
              style={{ borderRadius: 8 }}
            />
          )}
          <Button type="submit" isLoading={creating} variation="primary">
            {creating ? "Creating…" : "Create Note"}
          </Button>
        </Flex>
      </View>

      <Divider marginBlock="1.5rem" />

      {/* Notes Grid */}
      <Heading level={5} marginBlockEnd="0.5rem">Your notes</Heading>
      {loading ? (
        <Text>Loading…</Text>
      ) : notes.length === 0 ? (
        <Text variation="tertiary">No notes yet. Create your first one above.</Text>
      ) : (
        <Flex wrap="wrap" gap="1rem">
          {notes.map((n) => (
            <View key={n.id} className="card" style={{ width: 280 }}>
              {n.imageUrl && (
                <Image
                  alt={n.title || "Note image"}
                  src={n.imageUrl}
                  width="100%"
                  height="160px"
                  style={{ objectFit: "cover", borderRadius: 8 }}
                />
              )}
              <Heading level={6} marginBlockStart="0.5rem">{n.title || "Untitled"}</Heading>
              {n.content && <Text>{n.content}</Text>}
              <Flex justifyContent="flex-end" marginBlockStart="0.5rem">
                <Button size="small" variation="destructive" onClick={() => deleteNote(n)}>
                  Delete
                </Button>
              </Flex>
            </View>
          ))}
        </Flex>
      )}
    </View>
  );
}