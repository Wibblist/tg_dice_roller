use rand::Rng;
use regex::Regex;

use teloxide::{prelude::*, update_listeners::webhooks, utils::command::BotCommands};

#[tokio::main]
async fn main() {
    pretty_env_logger::init();
    log::info!("Starting dice roller bot...");

    let bot = Bot::from_env();

    let port = std::env::var("PORT").expect("PORT not set");
    let host = std::env::var("HOST").expect("HOST not set");
    let raw_url = std::env::var("WEBHOOK_URL").expect("WEBHOOK_URL not set");

    let addr = format!("{}:{}", host, port).parse().unwrap();
    let url = format!("{}/webhook", raw_url).parse().unwrap();

    let options = webhooks::Options::new(addr, url);

    let listener = webhooks::axum(bot.clone(), options)
        .await
        .expect("Failed to setup webhook");

    Command::repl_with_listener(bot, handle_commands, listener).await;
}

#[derive(BotCommands, Clone)]
#[command(
    rename_rule = "lowercase",
    description = "These commands are currently supported:"
)]
enum Command {
    #[command(description = "Start the bot.")]
    Start,
    #[command(description = "Display this text.")]
    Help,
    #[command(description = "Roll dice when given the right format (e.g. 2d20+5).")]
    R(String),
}

fn handle_dice_roll(roll_string: String) -> String {
    let pattern = Regex::new(r"^(\d*)d(\d+)(?:\+(\d+))?$").unwrap();

    if let Some(caps) = pattern.captures(&roll_string) {
        let num_dice_str = caps.get(1).map_or("1", |m| m.as_str());
        let num_dice = num_dice_str.parse::<i32>().unwrap_or(1);

        let faces_str = caps.get(2).map_or("0", |m| m.as_str());
        let faces = faces_str.parse::<i32>().unwrap_or(0);

        if faces <= 0 {
            return "Invalid dice roll format. The dice gotta have at least 1 face. :(".to_string();
        }

        let modifier_str = caps.get(3).map_or("0", |m| m.as_str());
        let modifier = modifier_str.parse::<i32>().unwrap_or(0);

        let mut rng = rand::rng();
        let mut rolls = Vec::new();

        for _ in 0..num_dice {
            rolls.push(rng.random_range(1..=faces));
        }

        let dice_total: i32 = rolls.iter().sum();
        let total = dice_total + modifier;

        let rolls_str = rolls
            .iter()
            .map(|&r| r.to_string())
            .collect::<Vec<String>>()
            .join(" + ");

        if modifier > 0 {
            format!(
                "Rolling {}d{} + {}: [{}] + {} = {}",
                num_dice, faces, modifier, rolls_str, modifier, total
            )
        } else {
            format!(
                "Rolling {}d{}: [{}] = {}",
                num_dice, faces, rolls_str, total
            )
        }
    } else {
        "Invalid dice roll format. Example: /r 2d20+5".to_string()
    }
}

async fn handle_commands(bot: Bot, msg: Message, cmd: Command) -> ResponseResult<()> {
    match cmd {
        Command::Start => {
            bot.send_message(msg.chat.id, "Ayyyy, I'm rollin here! >:D")
                .await?
        }
        Command::Help => {
            bot.send_message(msg.chat.id, Command::descriptions().to_string())
                .await?
        }
        Command::R(roll_string) => {
            bot.send_message(msg.chat.id, handle_dice_roll(roll_string))
                .await?
        }
    };

    Ok(())
}
