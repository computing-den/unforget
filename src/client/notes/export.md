# Export as JSON

[Click here](#export-json) to export notes in JSON format.

The JSON file will contain an array of notes where the type of each note is:

```
type Note = {

  // UUID version 4
  id: string;

  // Deleted notes have null text.
  text: string | null;

  // In ISO 8601 format
  creation_date: string;
  
  // In ISO 8601 format
  modification_date: string;
  
  // 0 means deleted, 1 means not deleted
  not_deleted: number;
  
  // 0 means archived, 1 means not archived
  not_archived: number;
  
  // 0 means not pinned, 1 means pinned
  pinned: number;

  // A higher number means higher on the list.
  // Usually, by default it's milliseconds since the epoch
  order: number;

}
```
