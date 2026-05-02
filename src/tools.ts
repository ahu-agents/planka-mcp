import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { PlankaApiError, PlankaClient, type HttpMethod } from "./planka-client.js";

const Position = z.number().finite().optional();
const Id = z.string().min(1);

function asText(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorText(error: unknown) {
  if (error instanceof PlankaApiError) {
    return asText({
      error: error.message,
      method: error.method,
      path: error.path,
      status: error.status,
      responseBody: error.responseBody,
    });
  }
  if (error instanceof Error) return asText({ error: error.message });
  return asText({ error: String(error) });
}

function tool<I extends z.ZodTypeAny>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: I,
  handler: (input: z.infer<I>) => Promise<unknown>,
) {
  server.registerTool(
    name,
    { description, inputSchema },
    (async (input: unknown) => {
      try {
        return asText(await handler(input as z.infer<I>));
      } catch (error) {
        return errorText(error);
      }
    }) as any,
  );
}

const Empty = z.object({}).default({});

export function createMcpServer(client: PlankaClient, config: Pick<Config, "enableRaw">): McpServer {
  const server = new McpServer({ name: "planka-mcp", version: "0.1.0" });

  tool(server, "health_check", "Authenticate with Planka and verify API reachability.", Empty, async () => client.health());

  tool(server, "list_projects", "List Planka projects and included boards.", Empty, async () => client.get("/api/projects"));

  tool(
    server,
    "get_structure",
    "Return projects with boards and lists. Optionally filter by projectId.",
    z.object({ projectId: Id.optional() }),
    async ({ projectId }) => {
      const projectsResponse = (await client.get("/api/projects")) as any;
      const projects = Array.isArray(projectsResponse?.items) ? projectsResponse.items : [];
      const boards = Array.isArray(projectsResponse?.included?.boards) ? projectsResponse.included.boards : [];
      const targetProjects = projectId ? projects.filter((project: any) => project.id === projectId) : projects;
      const result = [];
      for (const project of targetProjects) {
        const projectBoards = boards.filter((board: any) => board.projectId === project.id);
        const boardsWithLists = [];
        for (const board of projectBoards) {
          const boardResponse = (await client.get(`/api/boards/${board.id}`)) as any;
          const lists = Array.isArray(boardResponse?.included?.lists) ? boardResponse.included.lists : [];
          boardsWithLists.push({
            board,
            lists: lists.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)),
          });
        }
        result.push({
          project,
          boards: boardsWithLists.sort((a: any, b: any) => (a.board.position ?? 0) - (b.board.position ?? 0)),
        });
      }
      return { items: result };
    },
  );

  tool(server, "get_board", "Get a board with included lists, cards, labels, task lists, and tasks.", z.object({ boardId: Id }), async ({ boardId }) => client.get(`/api/boards/${boardId}`));
  tool(server, "get_card", "Get a card with included tasks, comments, labels, and attachments.", z.object({ cardId: Id }), async ({ cardId }) => client.get(`/api/cards/${cardId}`));
  tool(server, "get_comments", "Get comments for a card.", z.object({ cardId: Id }), async ({ cardId }) => client.get(`/api/cards/${cardId}/comments`));

  tool(
    server,
    "create_list",
    "Create a list on a board.",
    z.object({ boardId: Id, name: z.string().min(1), position: Position }),
    async ({ boardId, ...body }) => client.post(`/api/boards/${boardId}/lists`, body),
  );
  tool(server, "update_list", "Update a list.", z.object({ listId: Id, name: z.string().min(1).optional(), position: Position }), async ({ listId, ...body }) => client.patch(`/api/lists/${listId}`, body));
  tool(server, "delete_list", "Delete a list.", z.object({ listId: Id }), async ({ listId }) => client.delete(`/api/lists/${listId}`));

  tool(
    server,
    "create_card",
    "Create a card in a list. Defaults type to project for Planka 2.x.",
    z.object({
      listId: Id,
      name: z.string().min(1),
      description: z.string().optional(),
      position: Position,
      type: z.string().default("project"),
      dueDate: z.string().datetime().nullable().optional(),
    }),
    async ({ listId, ...body }) => client.post(`/api/lists/${listId}/cards`, body),
  );
  tool(
    server,
    "update_card",
    "Update card fields.",
    z.object({
      cardId: Id,
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      dueDate: z.string().datetime().nullable().optional(),
      isCompleted: z.boolean().optional(),
      isSubscribed: z.boolean().optional(),
    }),
    async ({ cardId, ...body }) => client.patch(`/api/cards/${cardId}`, body),
  );
  tool(server, "move_card", "Move a card to another list/position and optionally board.", z.object({ cardId: Id, listId: Id, boardId: Id.optional(), position: Position }), async ({ cardId, ...body }) => client.patch(`/api/cards/${cardId}`, body));
  tool(server, "delete_card", "Delete a card.", z.object({ cardId: Id }), async ({ cardId }) => client.delete(`/api/cards/${cardId}`));

  tool(server, "create_task_list", "Create a task list/checklist on a card.", z.object({ cardId: Id, name: z.string().min(1), position: Position }), async ({ cardId, ...body }) => client.post(`/api/cards/${cardId}/task-lists`, { position: 65536, ...body }));
  tool(server, "create_task", "Create a task in an existing task list.", z.object({ taskListId: Id, name: z.string().min(1), position: Position }), async ({ taskListId, ...body }) => client.post(`/api/task-lists/${taskListId}/tasks`, body));
  tool(server, "create_tasks", "Create multiple tasks in an existing task list.", z.object({ taskListId: Id, tasks: z.array(z.object({ name: z.string().min(1), position: Position })).min(1) }), async ({ taskListId, tasks }) => {
    const created = [];
    let nextPosition = 65536;
    for (const task of tasks) {
      const payload = { ...task, position: task.position ?? nextPosition };
      created.push(await client.post(`/api/task-lists/${taskListId}/tasks`, payload));
      nextPosition += 65536;
    }
    return { items: created };
  });
  tool(server, "update_task", "Update a task.", z.object({ taskId: Id, name: z.string().min(1).optional(), isCompleted: z.boolean().optional(), position: Position }), async ({ taskId, ...body }) => client.patch(`/api/tasks/${taskId}`, body));
  tool(server, "delete_task", "Delete a task.", z.object({ taskId: Id }), async ({ taskId }) => client.delete(`/api/tasks/${taskId}`));
  tool(server, "delete_task_list", "Delete a task list/checklist.", z.object({ taskListId: Id }), async ({ taskListId }) => client.delete(`/api/task-lists/${taskListId}`));

  tool(server, "add_comment", "Add a comment to a card.", z.object({ cardId: Id, text: z.string().min(1) }), async ({ cardId, text }) => client.post(`/api/cards/${cardId}/comments`, { text }));
  tool(server, "update_comment", "Update a comment.", z.object({ commentId: Id, text: z.string().min(1) }), async ({ commentId, text }) => client.patch(`/api/comments/${commentId}`, { text }));
  tool(server, "delete_comment", "Delete a comment.", z.object({ commentId: Id }), async ({ commentId }) => client.delete(`/api/comments/${commentId}`));

  tool(server, "create_label", "Create a label on a board.", z.object({ boardId: Id, name: z.string().nullable().optional(), color: z.string().min(1), position: Position }), async ({ boardId, ...body }) => client.post(`/api/boards/${boardId}/labels`, body));
  tool(server, "update_label", "Update a label.", z.object({ labelId: Id, name: z.string().nullable().optional(), color: z.string().optional(), position: Position }), async ({ labelId, ...body }) => client.patch(`/api/labels/${labelId}`, body));
  tool(server, "delete_label", "Delete a label.", z.object({ labelId: Id }), async ({ labelId }) => client.delete(`/api/labels/${labelId}`));
  tool(server, "add_label_to_card", "Attach a label to a card.", z.object({ cardId: Id, labelId: Id }), async ({ cardId, labelId }) => client.post(`/api/cards/${cardId}/card-labels`, { labelId }));
  tool(server, "remove_label_from_card", "Remove a label from a card using Planka 2.x labelId route.", z.object({ cardId: Id, labelId: Id }), async ({ cardId, labelId }) => client.delete(`/api/cards/${cardId}/card-labels/labelId:${labelId}`));
  tool(server, "set_card_labels", "Add and/or remove labels on a card.", z.object({ cardId: Id, addLabelIds: z.array(Id).default([]), removeLabelIds: z.array(Id).default([]) }), async ({ cardId, addLabelIds, removeLabelIds }) => {
    const removed = [];
    for (const labelId of removeLabelIds) {
      removed.push(await client.delete(`/api/cards/${cardId}/card-labels/labelId:${labelId}`));
    }
    const added = [];
    for (const labelId of addLabelIds) {
      added.push(await client.post(`/api/cards/${cardId}/card-labels`, { labelId }));
    }
    return { added, removed };
  });

  if (config.enableRaw) {
    tool(
      server,
      "planka_request",
      "Advanced escape hatch: make a raw Planka API request. Disabled unless PLANKA_MCP_ENABLE_RAW=1.",
      z.object({ method: z.enum(["GET", "POST", "PATCH", "DELETE"]), path: z.string().regex(/^\/api\//), body: z.unknown().optional() }),
      async ({ method, path, body }) => client.request(method as HttpMethod, path, body),
    );
  }

  return server;
}
