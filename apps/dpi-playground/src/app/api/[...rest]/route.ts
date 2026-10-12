import { err } from "@/hub/http";

const notFound = () => Response.json(err("not_found", "API route not found"), { status: 404 });

export {
  notFound as GET,
  notFound as POST,
  notFound as PUT,
  notFound as PATCH,
  notFound as DELETE,
};
