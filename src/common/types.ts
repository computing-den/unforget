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
};

export type DBToken = {
  username: string;
  token: string;
};

export type Credentials = {
  username: string;
  password: string;
};
