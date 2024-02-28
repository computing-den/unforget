export type Note = {
  id: string;
  text: string;
  creation_date: string;
  modification_date: string;
  order: number;
};

export type ServerConfig = {
  port: number;
};

export type DBUser = {
  username: string;
  password_hash: string;
  token: string;
};
