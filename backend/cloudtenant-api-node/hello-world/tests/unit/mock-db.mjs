// In-memory mock DynamoDB Document Client for local testing & isolation verification
export class MockDynamoDbClient {
  constructor() {
    this.items = new Map(); // Key: `${PK}##${SK}`, Value: Item
  }

  clear() {
    this.items.clear();
  }

  async send(command) {
    const cmdName = command.constructor.name;
    const input = command.input;

    if (cmdName === 'GetCommand') {
      const key = `${input.Key.PK}##${input.Key.SK}`;
      const item = this.items.get(key);
      return { Item: item ? JSON.parse(JSON.stringify(item)) : undefined };
    }

    if (cmdName === 'PutCommand') {
      const key = `${input.Item.PK}##${input.Item.SK}`;
      this.items.set(key, JSON.parse(JSON.stringify(input.Item)));
      return {};
    }

    if (cmdName === 'QueryCommand') {
      const { ExpressionAttributeValues } = input;
      const targetPk = ExpressionAttributeValues[':pk'];
      const skPrefix = ExpressionAttributeValues[':skPrefix'];

      const matches = [];
      for (const [k, item] of this.items.entries()) {
        if (item.PK === targetPk) {
          if (!skPrefix || (item.SK && item.SK.startsWith(skPrefix))) {
            matches.push(JSON.parse(JSON.stringify(item)));
          }
        }
      }
      return { Items: matches };
    }

    if (cmdName === 'UpdateCommand') {
      const key = `${input.Key.PK}##${input.Key.SK}`;
      const existing = this.items.get(key);

      if (!existing && input.ConditionExpression) {
        const error = new Error('The conditional request failed');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }

      const item = existing ? { ...existing } : { ...input.Key };
      const vals = input.ExpressionAttributeValues || {};

      if (vals[':name'] !== undefined) item.name = vals[':name'];
      if (vals[':desc'] !== undefined) item.description = vals[':desc'];
      if (vals[':status'] !== undefined) item.status = vals[':status'];
      if (vals[':priority'] !== undefined) item.priority = vals[':priority'];
      if (vals[':budget'] !== undefined) item.budget = vals[':budget'];
      if (vals[':updatedAt'] !== undefined) item.updatedAt = vals[':updatedAt'];

      this.items.set(key, item);
      return { Attributes: item };
    }

    if (cmdName === 'DeleteCommand') {
      const key = `${input.Key.PK}##${input.Key.SK}`;
      if (!this.items.has(key) && input.ConditionExpression) {
        const error = new Error('The conditional request failed');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }
      this.items.delete(key);
      return {};
    }

    throw new Error(`Unsupported mock command: ${cmdName}`);
  }
}
